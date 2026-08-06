import json, urllib.request
RPC="https://api.shasta.trongrid.io/jsonrpc"
def rpc(m,p):
    req=urllib.request.Request(RPC, data=json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),
                               headers={"Content-Type":"application/json"})
    r=json.load(urllib.request.urlopen(req, timeout=30))
    if "error" in r: raise RuntimeError(r["error"])
    return r["result"]
def call(to, data): return rpc("eth_call", [{"to":to,"data":data},"latest"])
def sel(s):
    import hashlib
    # keccak256 via pysha3 fallback: use eth_utils? implement keccak
    return None

SAFE="0xD72c8d27d0F45173d3178E35B2d496F56a407fF7"
# precomputed selectors
SELS={"getOwners":"0xa0e67e2b","getThreshold":"0xe75235b8","VERSION":"0xffa1ad74","nonce":"0xaffed0e0",
      "getStorageAt":"0x5624b25b"}
print("code sizes:")
for n,a in [("MultiSend b1","0x5b84368e2fde91c994434a4acbd29a0e1d60a1ea"),
            ("MultiSendCallOnly b1","0xf1dd46af04774c999e213fa6df2b4278bba8a757"),
            ("MultiSend b2","0x165a462e2017d8bf5e156e6d1ca6ac807023f861"),
            ("MultiSendCallOnly b2","0xf22794c67fe86468272a25401fe95acb6df39f19")]:
    c=rpc("eth_getCode",[a,"latest"]); print(f"  {n:24} {a} {(len(c)-2)//2} B")

print("\n== Safe", SAFE)
# masterCopy = storage slot 0
slot0=rpc("eth_getStorageAt",[SAFE,"0x0","latest"])
print("  masterCopy(slot0):", "0x"+slot0[-40:])
for n in ["VERSION","getThreshold","nonce"]:
    try: print(f"  {n}: {call(SAFE, SELS[n])}")
    except Exception as e: print(f"  {n}: ERR {e}")
try:
    ow=call(SAFE, SELS["getOwners"])
    body=ow[2:]; cnt=int(body[64:128],16)
    owners=["0x"+body[128+i*64+24:128+(i+1)*64] for i in range(cnt)]
    print("  owners:", owners)
except Exception as e: print("  owners ERR", e)
print("  TRX balance (sun):", int(rpc("eth_getBalance",[SAFE,"latest"]),16))
