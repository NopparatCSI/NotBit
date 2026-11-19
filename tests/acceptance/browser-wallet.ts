import { chromium, expect as uiExpect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { accounts, wallet, state, record, type Person } from "./environment";
import { type Hex } from "viem";

export { uiExpect };
// A deterministic EIP-1193 test provider, not the MetaMask extension. All signatures,
// sessions, transactions, Storage, RPC and database calls still use the real local stack.
// Explicitly document this boundary when reporting browser acceptance results.
export async function browserWallet(browser: Browser, person: Person) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "UTC" });
  await context.exposeBinding("acceptanceWalletRequest", async (_source, input: {method:string;params: unknown[]}) => {
    const { method, params = [] } = input;
    if (method === "personal_sign") return accounts[person].signMessage({ message: { raw: params[0] as Hex } });
    if (method === "eth_signTypedData_v4") return accounts[person].signTypedData(JSON.parse(params[1] as string));
    if (method === "eth_sendTransaction") {
      const tx = params[0] as {to:Hex;data:Hex;value?:Hex;gas?:Hex};
      const hash = await wallet(person).sendTransaction({to:tx.to,data:tx.data,value:BigInt(tx.value??"0x0"),...(tx.gas?{gas:BigInt(tx.gas)}:{})});
      record("browser-wallet-send",{person,hash});return hash;
    }
    const response=await fetch(state.rpcUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
    const result=await response.json();if(result.error)throw new Error(result.error.message);return result.result;
  });
  await context.addInitScript(({address,wrongAddress}) => {
    const w=window as unknown as {ethereum:unknown;acceptanceWalletRequest:(x:unknown)=>Promise<unknown>;acceptanceWalletMode:string;acceptanceSetWalletMode:(mode:string)=>void};
    let chain="0x7a69";const listeners=new Map<string,Set<(...args:unknown[])=>void>>();
    const emit=(name:string,...args:unknown[])=>listeners.get(name)?.forEach(fn=>fn(...args));
    w.acceptanceWalletMode="normal";
    w.acceptanceSetWalletMode=mode=>{w.acceptanceWalletMode=mode;if(mode==="wrong-account"||mode==="normal")emit("accountsChanged",[mode==="wrong-account"?wrongAddress:address]);if(mode==="reject-network"){chain="0xaa36a7";emit("chainChanged",chain);}};
    w.ethereum={isMetaMask:true,on:(name:string,fn:(...args:unknown[])=>void)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(fn);},removeListener:(name:string,fn:(...args:unknown[])=>void)=>listeners.get(name)?.delete(fn),
      request:async(input:{method:string;params?:unknown[]})=>{
        const mode=w.acceptanceWalletMode;
        if(mode==="reject"&&["personal_sign","eth_signTypedData_v4","eth_sendTransaction"].includes(input.method))throw Object.assign(new Error("User rejected the request."),{code:4001});
        if(input.method==="eth_accounts"||input.method==="eth_requestAccounts")return [mode==="wrong-account"?wrongAddress:address];
        if(input.method==="eth_chainId")return chain;
        if(input.method==="wallet_switchEthereumChain"){
          if(mode==="reject-network")throw Object.assign(new Error("User rejected network switch."),{code:4001});
          chain=(input.params![0] as {chainId:string}).chainId;emit("chainChanged",chain);return null;
        }
        if(input.method==="wallet_requestPermissions")return [{parentCapability:"eth_accounts"}];
        if(input.method==="wallet_getCapabilities")return {};
        return w.acceptanceWalletRequest(input);
      }};
  },{address:accounts[person].address,wrongAddress:accounts.outsider.address});
  return {context,page:await context.newPage()};
}
export async function signIn(page:Page) {
  await page.goto(`${state.appUrl}/account`);
  await page.getByRole("button",{name:"Sign in with MetaMask",exact:true}).click();
  await uiExpect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible({timeout:20000});
}
export async function openBrowser() { return chromium.launch({headless:true}); }
