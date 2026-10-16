import sqlite3, os
p = r'C:\Users\lenovo\Desktop\预测市场\event-mirror\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite'
con = sqlite3.connect(p)
print('tables:', con.execute("select name from sqlite_master where type='table'").fetchall())
try:
    print('workspaces rows:', con.execute('select count(*) from research_workspaces').fetchone()[0])
    print('preferences rows:', con.execute('select count(*) from research_preferences').fetchone()[0])
    for row in con.execute('select id, owner, mode, revision, substr(payload,1,120) from research_workspaces'):
        print('ws:', row)
except Exception as e:
    print('query error:', e)
con.close()
