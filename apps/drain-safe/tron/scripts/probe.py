import json, urllib.request

RPC="https://api.shasta.trongrid.io/jsonrpc"
def rpc(method, params):
    req=urllib.request.Request(RPC, data=json.dumps({"jsonrpc":"2.0","id":1,"method":method,"params":params}).encode(),
                               headers={"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(req, timeout=30))

CANDIDATES = {
 "MultiSendCallOnly 1.3.0 canonical": "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D",
 "MultiSendCallOnly 1.3.0 eip155":    "0xA1dabEF33b3B82c7814B6D82A79e50F4AC44102B",
 "MultiSendCallOnly 1.4.1":           "0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
 "MultiSend 1.3.0 canonical":         "0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761",
 "MultiSend 1.3.0 eip155":            "0x998739BFdAAdde7C933B942a68053933098f9EDa",
 "MultiSend 1.4.1":                   "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526",
 "SafeL2 1.4.1 (reported)":           "0x2E6355A073170c38b778AF539B8F11E207CA4e30",
 "Safe 1.3.0 L2 canonical":           "0x3E5c63644E683549055b9Be8653de26E0B4CD36E",
 "TestSafe 0xD72c":                   "0xD72c8d27d0F45173d3178E35B2d496F56a407fF7",
}
print("chainId:", rpc("eth_chainId",[])["result"], "block:", rpc("eth_blockNumber",[])["result"])
for name, addr in CANDIDATES.items():
    try:
        r = rpc("eth_getCode", [addr, "latest"])["result"]
        print(f"{'CODE %6d B' % ((len(r)-2)//2) if r not in ('0x','0x0','') else 'NO CODE   ':>12}  {name:32} {addr}")
    except Exception as e:
        print("ERR", name, e)
