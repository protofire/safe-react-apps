import json, urllib.request
def post(url, payload):
    req=urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(req, timeout=30))
def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"Accept":"application/json"}), timeout=30))

# hex(20) -> tron 41-hex
def to41(h): return "41"+h.lower().replace("0x","")

for label, addr in [("SafeL2-1.4.1","0x2E6355A073170c38b778AF539B8F11E207CA4e30"),
                    ("TestSafe","0xD72c8d27d0F45173d3178E35B2d496F56a407fF7")]:
    c = post("https://api.shasta.trongrid.io/wallet/getcontract", {"value": to41(addr)})
    print(f"== {label} {addr}")
    print("   name:", c.get("name"), "| origin:", c.get("origin_address"))
    abi = c.get("abi",{}).get("entrys")
    print("   on-chain ABI entries:", len(abi) if abi else 0)
