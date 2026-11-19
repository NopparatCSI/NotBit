import { beforeAll, describe, expect, test } from "vitest";
import { openBrowser,browserWallet,signIn,uiExpect } from "./browser-wallet";
import { api,login,createDeal,state,client,index,mine,service,record } from "./environment";
beforeAll(async()=>{await login("buyer");await login("seller");});
describe.sequential("21 wallet and pending-transaction recovery",()=>{
  for(const mode of ["reject","wrong-account","reject-network","insufficient-gas","rpc-failure"]){
    test(mode,async()=>{
      const deal=await createDeal(mode);const browser=await openBrowser();let balance:bigint|undefined;
      try{
        const {page}=await browserWallet(browser,"buyer");await signIn(page);
        await page.goto(`${state.appUrl}/trade/${deal.conversationId}?order=${deal.offer.id}`);
        if(mode==="insufficient-gas"){balance=await client.getBalance({address:state.roles.buyer});await client.request({method:"hardhat_setBalance" as never,params:[state.roles.buyer,"0x0"] as never});}
        else if(mode==="rpc-failure")await page.route("http://127.0.0.1:8545/**",route=>route.abort("failed"));
        else await page.evaluate(mode=>(window as unknown as {acceptanceSetWalletMode:(mode:string)=>void}).acceptanceSetWalletMode(mode),mode);
        await page.getByRole("button",{name:"Deposit 0.001 ETH",exact:true}).click();
        const alert=page.getByRole("alert").filter({hasText:/\S/}).last();
        await uiExpect(alert).toBeVisible({timeout:25000});
        const error=await alert.innerText();
        if(mode==="wrong-account")expect(error).toMatch(/account used to sign in/);
        expect((await api("buyer",`/orders/${deal.offer.id}`)).data.status).toBe("AWAITING_DEPOSIT");
        const attempts=await service.from("funding_attempts").select("tx_hash").eq("offer_id",deal.offer.id);expect(attempts.data).toHaveLength(0);
        record("21",{passed:true,case:mode,error});
      }finally{if(balance!==undefined)await client.request({method:"hardhat_setBalance" as never,params:[state.roles.buyer,`0x${balance.toString(16)}`] as never});await browser.close();}
    });
  }
  test("reload during an actual pending deposit does not send a second deposit",async()=>{
    const deal=await createDeal("reload-pending");const browser=await openBrowser();
    try{
      const {page}=await browserWallet(browser,"buyer");await signIn(page);await page.goto(`${state.appUrl}/trade/${deal.conversationId}?order=${deal.offer.id}`);
      await client.request({method:"evm_setIntervalMining" as never,params:[0] as never});await client.request({method:"evm_setAutomine" as never,params:[false] as never});
      await page.getByRole("button",{name:"Deposit 0.001 ETH",exact:true}).click();
      await uiExpect.poll(async()=>{const r=await service.from("funding_attempts").select("tx_hash").eq("offer_id",deal.offer.id);return r.data?.length??0;},{timeout:20000}).toBe(1);
      await page.reload();await uiExpect(page.getByRole("button",{name:"Deposit 0.001 ETH",exact:true})).toBeDisabled();
      await mine(3);await client.request({method:"evm_setAutomine" as never,params:[true] as never});await index();
      await page.reload();await uiExpect(page.getByRole("heading",{name:"Deposit confirmed",exact:true})).toBeVisible();
      const attempts=await service.from("funding_attempts").select("tx_hash").eq("offer_id",deal.offer.id);expect(attempts.data).toHaveLength(1);
      const events=await service.from("chain_events").select("tx_hash").eq("event_name","OrderFunded").eq("payload->>orderId",deal.offer.signedOffer.orderId);expect(events.data).toHaveLength(1);
      record("21",{passed:true,case:"reload-pending",orderId:deal.offer.id});
    }finally{await client.request({method:"evm_setAutomine" as never,params:[true] as never});await client.request({method:"evm_setIntervalMining" as never,params:[1000] as never});await browser.close();}
  });
});
