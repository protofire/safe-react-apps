import json, urllib.request, time
def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"Accept":"application/json"}), timeout=40))
def post(url, payload):
    req=urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(req, timeout=40))

DEPLOYER="41495369e87dd860a5546bd0d6c276691f61e9a4cb"
# find all contract-creation txs by the Safe deployer
url=f"https://api.shasta.trongrid.io/v1/accounts/{DEPLOYER}/transactions?limit=200&order_by=block_timestamp,asc"
d=get(url)
created=[]
for tx in d.get("data",[]):
    c=tx.get("raw_data",{}).get("contract",[{}])[0]
    if c.get("type")=="CreateSmartContract":
        v=c.get("parameter",{}).get("value",{})
        nm=v.get("new_contract",{}).get("name") or "?"
        created.append((tx.get("txID"), nm))
print("contract creations by Safe deployer:", len(created))
for txid, nm in created:
    info=post("https://api.shasta.trongrid.io/wallet/gettransactioninfobyid", {"value": txid})
    ca=info.get("contract_address","")
    evm="0x"+ca[2:] if ca.startswith("41") else ca
    print(f"  {nm:28} {evm}")
