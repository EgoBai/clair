#!/bin/bash
# tree-diff push v2.1 (curl版): 把本地 deploy tree 与远端 main tree 的差异推上去（排除 .github/workflows/*）
# 用法: gh_push_treediff2.sh <token> [commit_message]
set -euo pipefail
cd /workspace/clair
TOKEN="$1"; MSG="${2:-chore(sync): tree-diff 同步本地至远端}"
API="https://api.github.com/repos/EgoBai/clair"
H=(-H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" -H "Content-Type: application/json" --resolve api.github.com:443:140.82.112.6)

# 1. 远端当前 ref + tree（总是先拉最新，容忍并行写入）
PARENT=$(curl -s "${H[@]}" "$API/git/ref/heads/main" | python3 -c "import json,sys;print(json.load(sys.stdin)['object']['sha'])")
BT=$(curl -s "${H[@]}" "$API/git/commits/$PARENT" | python3 -c "import json,sys;print(json.load(sys.stdin)['tree']['sha'])")
curl -s "${H[@]}" "$API/git/trees/$BT?recursive=1" -o /tmp/td_rt.json
echo "parent=$PARENT base_tree=$BT"

# 2. 计算差异
TREE_ENTRIES=$(python3 - "$TOKEN" <<'PYEOF'
import json, base64, subprocess, sys
token = sys.argv[1]
rt = json.loads(open('/tmp/td_rt.json').read(), strict=False)
remote = {e['path']: e['sha'] for e in rt['tree'] if e['type'] == 'blob'}
out = subprocess.check_output(['git', '-c', 'core.quotepath=off', 'ls-tree', '-r', 'deploy'])
local = {}
for line in out.decode().splitlines():
    meta, path = line.split('\t', 1); mode, typ, sha = meta.split()
    if typ == 'blob': local[path] = (mode, sha)
entries = []
for path, (mode, lsha) in sorted(local.items()):
    if path.startswith('.github/workflows/'): continue
    if remote.get(path) == lsha: continue
    content = subprocess.check_output(['git', 'show', f'deploy:{path}'])
    with open('/tmp/td_blob.json', 'w') as f:
        json.dump({'content': base64.b64encode(content).decode(), 'encoding': 'base64'}, f)
    r = subprocess.run(['curl', '-s', '--max-time', '30', '--resolve', 'api.github.com:443:140.82.112.6',
        '-H', 'Authorization: Bearer ' + token, '-H', 'Accept: application/vnd.github+json',
        '-H', 'Content-Type: application/json', '--data-binary', '@/tmp/td_blob.json',
        'https://api.github.com/repos/EgoBai/clair/git/blobs'], capture_output=True, text=True)
    sha = json.loads(r.stdout)['sha']
    print(f"  blob {path} ({len(content)}B)", file=sys.stderr)
    entries.append({'path': path, 'mode': mode, 'type': 'blob', 'sha': sha})
print(json.dumps(entries))
PYEOF
)
COUNT=$(echo "$TREE_ENTRIES" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")
echo "diff files: $COUNT"
[ "$COUNT" = "0" ] && echo "NO-DIFF" && exit 0

# 3. tree + commit + ref
python3 - > /tmp/td_tree.json <<PYEOF
import json
print(json.dumps({"base_tree": "$BT", "tree": json.loads('''$TREE_ENTRIES''')}))
PYEOF
NT=$(curl -s "${H[@]}" -X POST "$API/git/trees" --data-binary @/tmp/td_tree.json | python3 -c "import json,sys;print(json.load(sys.stdin).get('sha','FAIL'))")
echo "new tree=$NT"
python3 - > /tmp/td_commit.json <<PYEOF
import json
print(json.dumps({"message": '''$MSG''', "tree": "$NT", "parents": ["$PARENT"]}))
PYEOF
NC=$(curl -s "${H[@]}" -X POST "$API/git/commits" --data-binary @/tmp/td_commit.json | python3 -c "import json,sys;print(json.load(sys.stdin).get('sha','FAIL'))")
echo "new commit=$NC"
curl -s "${H[@]}" -X PATCH "$API/git/refs/heads/main" -d "{\"sha\":\"$NC\",\"force\":false}" | python3 -c "import json,sys;d=json.load(sys.stdin);print('ref →', d['object']['sha'][:7] if 'object' in d else d)"
echo "PUSH_OK"
