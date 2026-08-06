import json, urllib.request
def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"Accept":"application/json"}), timeout=40))
SAFE41="41d72c8d27d0f45173d3178e35b2d496f56a407ff7"
d=get(f"https://api.shasta.trongrid.io/v1/accounts/{SAFE41}")
for a in d.get("data",[]):
    print("TRX(sun):", a.get("balance"))
    print("trc20:", json.dumps(a.get("trc20", []), indent=1)[:800])
    print("assetV2:", json.dumps(a.get("assetV2", []))[:300])
