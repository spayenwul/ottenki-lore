import re, os, glob, sys, subprocess
os.chdir('E:/Диск/Ролка Земля-под-поясом')
names = set(); paths = set()
for p in glob.glob('**/*.md', recursive=True):
    p = p.replace(os.sep, '/'); names.add(os.path.basename(p)[:-3]); paths.add(p[:-3])
def broken(t):
    out = set()
    for m in set(re.findall(r'\[\[([^\]|#]+)', t)):
        m = m.replace('\\', '').strip()
        if m not in names and m not in paths: out.add(m)
    return out
for f in sys.argv[1:]:
    t = open(f, encoding='utf-8').read()
    try:
        old = subprocess.run(['git', 'show', 'HEAD:' + f], capture_output=True).stdout.decode('utf-8', 'ignore')
    except Exception: old = ''
    new = broken(t) - broken(old)
    if new: print(f, 'NEW BROKEN:', sorted(new))
print('done')
