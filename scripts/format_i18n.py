import json,sys
for path in sys.argv[1:]:
    d=json.load(open(path))
    lines=['{','  "_meta": '+json.dumps(d['_meta'],ensure_ascii=False)+',','  "strings": {']
    items=list(d['strings'].items())
    for i,(k,v) in enumerate(items):
        lines.append('    '+json.dumps(k,ensure_ascii=False)+': '+json.dumps({"text":v["text"],"reviewedBy":v["reviewedBy"]},ensure_ascii=False)+(',' if i<len(items)-1 else ''))
    lines+=['  }','}','']
    open(path,'w').write('\n'.join(lines))
