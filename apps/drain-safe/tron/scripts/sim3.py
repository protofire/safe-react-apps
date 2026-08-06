import json, urllib.request
RPC="https://api.shasta.trongrid.io/jsonrpc"
def rpc(m,p):
    req=urllib.request.Request(RPC,data=json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),
                               headers={"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(req,timeout=40))
SAFE="0xD72c8d27d0F45173d3178E35B2d496F56a407fF7"; OWNER="0x61ca933fd67b9c0eb3a678fb8cda50d4c95bf63d"
MSCO="0xf1dd46Af04774C999e213FA6dF2b4278BBa8A757"; TOKEN="0x42a1e39aefA49290F2B3F9ed688D7cecf86CD6E0"
w=lambda x:hex(x)[2:].rjust(64,"0"); a32=lambda a:a.lower().replace("0x","").rjust(64,"0")
pad=lambda h:h+"0"*((64-len(h)%64)%64)

def build(txs, signer=OWNER):
    packed="".join("00"+t["to"].lower()[2:]+w(t["value"])+w(len(t["data"])//2)+t["data"] for t in txs)
    ms="8d80ff0a"+w(32)+w(len(packed)//2)+pad(packed)
    sig=a32(signer)+w(0)+"01"; D=320; S=D+32+len(pad(ms))//2
    head=a32(MSCO)+w(0)+w(D)+w(1)+w(0)+w(0)+w(0)+a32("0x0")+a32("0x0")+w(S)
    return "0x6a761202"+head+w(len(ms)//2)+pad(ms)+w(len(sig)//2)+pad(sig)

def run(label, txs, frm=OWNER):
    d=build(txs)
    r=rpc("eth_call",[{"from":frm,"to":SAFE,"data":d},"latest"])
    ok = r.get("result") and int(r["result"],16)==1
    g=rpc("eth_estimateGas",[{"from":frm,"to":SAFE,"data":d}])
    gas=g.get("result") and int(g["result"],16)
    print(f"{label:56} {'PASS' if ok else 'REVERT'}  gas={gas}  {(r.get('error') or {}).get('message','')}")

TRC20 = lambda to,amt: {"to":TOKEN,"value":0,"data":"a9059cbb"+a32(to)+w(amt)}
NATIVE= lambda to,v: {"to":to,"value":v,"data":""}
FRESH = "0x1111111111111111111111111111111111111111"   # never-activated account

print("Safe holds 1 TRX (1000000 sun) and 0 USDT. Controls prove each leg really executes:\n")
run("A  2-asset drain: 1 TRX + TRC-20 amount 0  (baseline)", [NATIVE(OWNER,1000000), TRC20(OWNER,0)])
run("B  native leg over-spend: 2 TRX  -> must REVERT",       [NATIVE(OWNER,2000000), TRC20(OWNER,0)])
run("C  token leg over-spend: 1 USDT -> must REVERT",        [NATIVE(OWNER,1000000), TRC20(OWNER,1)])
run("D  native only (1 tx via MultiSend)",                   [NATIVE(OWNER,1000000)])
run("E  drain to UNACTIVATED recipient (R2 energy check)",   [NATIVE(FRESH,1000000), TRC20(FRESH,0)])
run("F  5-asset batch (R2 batch-size check)",                [NATIVE(OWNER,1000000)]+[TRC20(OWNER,0)]*4)
run("G  20-asset batch (R2 upper bound)",                    [NATIVE(OWNER,1000000)]+[TRC20(OWNER,0)]*19)
