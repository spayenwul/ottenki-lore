import os

base = "E:/Диск/Ролка Земля-под-поясом/Лор/Школы магии"

files = {}

files["Теократия Бролез/Живущая Душа.md"] = "test"

for rel_path, content in files.items():
    full_path = os.path.join(base, rel_path)
    dir_path = os.path.dirname(full_path)
    os.makedirs(dir_path, exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"OK: {rel_path}")

print("Done")
