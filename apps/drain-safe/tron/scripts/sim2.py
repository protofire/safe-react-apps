import json, urllib.request
RPC="https://api.shasta.trongrid.io/jsonrpc"
def rpc(m,p):
    req=urllib.request.Request(RPC, data=json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),
                               headers={"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(req, timeout=40))
def call(o):
    r=rpc("eth_call",[o,"latest"]); return r.get("result"), r.get("error")

SAFE  = "0xD72c8d27d0F45173d3178E35B2d496F56a407fF7"
OWNER = "0x61ca933fd67b9c0eb3a678fb8cda50d4c95bf63d"
MSCO  = "0xf1dd46Af04774C999e213FA6dF2b4278BBa8A757"   # from tron-deployments.json / overrides
TOKEN = "0x42a1e39aefA49290F2B3F9ed688D7cecf86CD6E0"
RECIP = OWNER
TRX   = 1000000

w   = lambda x: hex(x)[2:].rjust(64,"0")
a32 = lambda a: a.lower().replace("0x","").rjust(64,"0")
pad = lambda h: h + "0"*((64 - len(h)%64)%64)

# --- drain-safe's tokenToTx() output, verbatim shape ---
txs = [ {"to":RECIP, "value":TRX, "data":""},                                  # native TRX
        {"to":TOKEN, "value":0,   "data":"a9059cbb"+a32(RECIP)+w(0)} ]         # TRC-20 transfer

# --- MultiSend packing: op(1)|to(20)|value(32)|len(32)|data ---
packed = "".join("00"+t["to"].lower()[2:]+w(t["value"])+w(len(t["data"])//2)+t["data"] for t in txs)
ms = "8d80ff0a" + w(32) + w(len(packed)//2) + pad(packed)

# --- execTransaction: 10 head words; signature r=owner,s=0,v=1 (approved-hash / msg.sender) ---
sig = a32(OWNER)+w(0)+"01"
D_OFF = 32*10
S_OFF = D_OFF + 32 + len(pad(ms))//2
head = (a32(MSCO)+w(0)+w(D_OFF)+w(1)+w(0)+w(0)+w(0)+a32("0x0")+a32("0x0")+w(S_OFF))
data = "0x6a761202" + head + w(len(ms)//2)+pad(ms) + w(len(sig)//2)+pad(sig)

print("MultiSend payload :", ms[:10], "...", len(ms)//2, "bytes")
print("TRC-20 word       :", txs[1]["data"][8:72], "(no 41 prefix)")
print("\n=== eth_call Safe.execTransaction -> delegatecall MultiSendCallOnly, from=owner ===")
res, err = call({"from":OWNER,"to":SAFE,"data":data})
print("result:", res, "| error:", (err or {}).get("message"))
if res and int(res,16)==1:
    print(">>> SUCCESS: the 2-asset batch executes on TVM")

# negative control: wrong owner in the signature must revert (proves `from`/sig are honoured)
bad = data.replace(a32(OWNER)+w(0)+"01", a32("0x000000000000000000000000000000000000dead")+w(0)+"01")
r2,e2 = call({"from":OWNER,"to":SAFE,"data":bad})
print("control (bad signer):", r2, "|", (e2 or {}).get("message"))

# gas estimate for the real batch
g = rpc("eth_estimateGas",[{"from":OWNER,"to":SAFE,"data":data}])
print("estimateGas:", g.get("result") and int(g["result"],16), (g.get("error") or {}).get("message"))
