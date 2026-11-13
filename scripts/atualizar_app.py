import sys
import os
import shutil
import re

# Forca UTF-8 na saida do console para evitar erros no Windows cp1252
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

args = sys.argv[1:]
if len(args) < 1:
    print("[!] Uso: python atualizar_app.py \"Novo Nome\" [caminho_icone.png]")
    sys.exit(1)

new_name = args[0].strip()
icon_path = args[1].strip() if len(args) > 1 else ""

print("======================================================")
print(f"[*] ATUALIZANDO CONFIGURACOES DO APLICATIVO ANDROID")
print(f"[*] Novo Nome do App: {new_name}")
if icon_path:
    print(f"[*] Novo Icone: {icon_path}")
print("======================================================")

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 1. Atualizar strings.xml do Android
strings_path = os.path.join(ROOT_DIR, "android-app", "app", "src", "main", "res", "values", "strings.xml")
if os.path.exists(strings_path):
    with open(strings_path, "r", encoding="utf-8") as f:
        content = f.read()
    content = re.sub(r'<string name="app_name">.*?</string>', f'<string name="app_name">{new_name}</string>', content)
    with open(strings_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("[+] strings.xml atualizado com sucesso!")

# 2. Atualizar activity_main.xml (Titulo na tela do celular)
activity_path = os.path.join(ROOT_DIR, "android-app", "app", "src", "main", "res", "layout", "activity_main.xml")
if os.path.exists(activity_path):
    with open(activity_path, "r", encoding="utf-8") as f:
        content = f.read()
    content = re.sub(r'android:text="[^"]*"(\s*android:textColor="@color/text_main"\s*android:textSize="22sp")', f'android:text="{new_name}"\\1', content)
    with open(activity_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("[+] activity_main.xml atualizado!")

# 3. Atualizar o manifesto PWA web
manifest_path = os.path.join(ROOT_DIR, "public", "manifest.json")
if os.path.exists(manifest_path):
    with open(manifest_path, "r", encoding="utf-8") as f:
        content = f.read()
    content = re.sub(r'"name":\s*".*?"', f'"name": "{new_name}"', content)
    content = re.sub(r'"short_name":\s*".*?"', f'"short_name": "{new_name}"', content)
    with open(manifest_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("[+] public/manifest.json atualizado!")

# 4. Atualizar o Icone (se informado)
if icon_path and os.path.exists(icon_path):
    shutil.copy2(icon_path, os.path.join(ROOT_DIR, "iconeapk.png"))
    shutil.copy2(icon_path, os.path.join(ROOT_DIR, "public", "icon.png"))
    
    res_dir = os.path.join(ROOT_DIR, "android-app", "app", "src", "main", "res")
    for density in ["mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"]:
        target_dir = os.path.join(res_dir, density)
        os.makedirs(target_dir, exist_ok=True)
        shutil.copy2(icon_path, os.path.join(target_dir, "ic_launcher.png"))
    print(f"[+] Novo icone aplicado em todas as resolucoes Android!")

# 5. Commit e Push no Git (Gera nova versao e compilacao do APK automaticamente)
print("\n[*] Enviando alteracoes para o GitHub...")
os.system("git add .")
os.system(f'git commit -m "chore: Atualizar nome do app para {new_name} e novo icone"')
os.system("git push origin main")

# 6. Atualizar VPS via Paramiko
print("\n[*] Conectando a VPS 169.58.140.109 para sincronizar...")
try:
    import paramiko
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("169.58.140.109", port=22, username="root", password="Gd1700al@@", timeout=15)
    
    stdin, stdout, stderr = ssh.exec_command("cd /var/www/rastreador && git pull && pm2 restart rastreador")
    out = stdout.read().decode('utf-8', errors='ignore').strip()
    err = stderr.read().decode('utf-8', errors='ignore').strip()
    if out:
        print("[VPS Out]:", out[:300])
    if err:
        print("[VPS Err]:", err[:300])
    ssh.close()
    print("[+] VPS sincronizada e reiniciada com sucesso!")
except Exception as e:
    print(f"[-] Aviso ao sincronizar VPS: {e}")

print("\n======================================================")
print("TUDO PRONTO COM SUCESSO!")
print(f"1. O nome foi alterado para: {new_name}")
print("2. As alteracoes foram enviadas para o GitHub!")
print("3. O GitHub Actions iniciou a compilacao do novo APK automaticamente.")
print("4. O backend na VPS ja foi atualizado e reiniciado.")
print("======================================================")
