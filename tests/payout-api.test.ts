import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({ viewer:vi.fn(), config:vi.fn(), checked:vi.fn(), read:vi.fn(), tip:vi.fn() }));
vi.mock("@/lib/auth/viewer",()=>({ requireViewer:m.viewer,ViewerError:class extends Error{constructor(public status:number,message:string){super(message)}} }));
vi.mock("@/lib/chain/config",()=>({getEscrowConfig:m.config,getCheckedEscrowClient:m.checked}));
import { GET } from "../src/app/api/v1/payout/route";
import { ViewerError } from "../src/lib/auth/viewer";
const wallet="0x1111111111111111111111111111111111111111";
beforeEach(()=>{vi.clearAllMocks(); m.viewer.mockResolvedValue({wallet});m.config.mockReturnValue({chainId:31337,escrowAddress:wallet});m.checked.mockResolvedValue({readContract:m.read,getBlockNumber:m.tip});m.tip.mockResolvedValue(12n);m.read.mockResolvedValue(100n);});
it("reads only the signed-in wallet's queued payout at a three-confirmation block",async()=>{
 const response=await GET(); expect(response.status).toBe(200);expect((await response.json()).data.pendingWei).toBe("100");
 expect(m.read).toHaveBeenCalledWith(expect.objectContaining({functionName:"pendingPayouts",args:[wallet],blockNumber:10n}));
});
it("requires a verified session before checking balances",async()=>{
 m.viewer.mockRejectedValue(new ViewerError(401,"Sign in"));expect((await GET()).status).toBe(401);expect(m.read).not.toHaveBeenCalled();
});
it("reports unavailable RPC without claiming a zero balance",async()=>{
 m.read.mockRejectedValue(new Error("RPC unavailable"));const response=await GET();expect(response.status).toBe(503);expect((await response.json()).error.code).toBe("UNAVAILABLE");
});
