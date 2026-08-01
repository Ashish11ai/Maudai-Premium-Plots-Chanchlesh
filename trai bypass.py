import os
import sys
import random
import subprocess
import time
import uuid
import ctypes
import winreg
import traceback
import urllib.request
import tempfile
import atexit
import signal
import shutil
import json

# ------------------------------------------------------------
# Admin check & elevation
# ------------------------------------------------------------
def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def run_as_admin():
    if not is_admin():
        script = os.path.abspath(sys.argv[0])
        params = " ".join(f'"{arg}"' for arg in sys.argv[1:])
        ctypes.windll.shell32.ShellExecuteW(
            None, "runas", sys.executable,
            f'"{script}" {params}',
            None, 1
        )
        sys.exit()

# ------------------------------------------------------------
# Global backup & auto‑restore on exit
# ------------------------------------------------------------
backup = {
    "guid": None,
    "mac": None,
    "vol_serial": None,
    "pc_name": None,
    "proxy_enabled": False,
    "proxy_server": "",
    "proxy_override": "",
    "adapter_subkey": None,
    "adapter_desc": None,
    "volumeid_exe": None,
    "storage_json_path": None,
    "storage_json_backup": None,
}
spoiled = False

def full_restore():
    global spoiled
    if not spoiled:
        return

    print("\n" + "="*60)
    print("               AUTOMATIC RESTORATION")
    print("="*60)
    print("[*] Restoring original settings...")

    # Restore hardware identifiers
    if backup["mac"] == "HARDWARE_DEFAULT":
        delete_mac_address(backup["adapter_subkey"])
    else:
        set_mac_address(backup["adapter_subkey"], backup["mac"])
    set_machine_guid(backup["guid"])
    if backup["volumeid_exe"] and backup["vol_serial"]:
        set_volume_serial(backup["volumeid_exe"], backup["vol_serial"])
    set_computer_name(backup["pc_name"])
    restore_proxy(backup["proxy_enabled"], backup["proxy_server"], backup["proxy_override"])
    restart_adapter(backup["adapter_desc"])

    # Restore original storage.json
    if backup["storage_json_backup"] and backup["storage_json_path"]:
        try:
            os.makedirs(os.path.dirname(backup["storage_json_path"]), exist_ok=True)
            shutil.copy2(backup["storage_json_backup"], backup["storage_json_path"])
            os.remove(backup["storage_json_backup"])
            print("[+] Restored original storage.json")
        except Exception as e:
            print(f"[!] Failed to restore storage.json: {e}")

    spoiled = False
    print("[+] Restoration complete. You can now close this window.")

atexit.register(full_restore)

def console_handler(ctrl_type):
    if ctrl_type in (0, 1, 2, 5, 6):
        full_restore()
        return True
    return False

if sys.platform == "win32":
    try:
        ctypes.windll.kernel32.SetConsoleCtrlHandler(console_handler, True)
    except:
        pass

signal.signal(signal.SIGINT, lambda sig, frame: sys.exit(0))

# ------------------------------------------------------------
# Registry / hardware helpers
# ------------------------------------------------------------
GUID_PATH = r"SOFTWARE\Microsoft\Cryptography"
GUID_VALUE = "MachineGuid"
ADAPTER_KEY = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e972-e325-11ce-bfc1-08002be10318}"
PROXY_REG_PATH = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings"
VOLUMEID_URL = "https://live.sysinternals.com/Volumeid64.exe"

def get_machine_guid():
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, GUID_PATH, 0, winreg.KEY_READ)
        guid, _ = winreg.QueryValueEx(key, GUID_VALUE)
        winreg.CloseKey(key)
        return guid
    except Exception as e:
        return f"ERROR: {e}"

def set_machine_guid(new_guid):
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, GUID_PATH, 0, winreg.KEY_SET_VALUE)
        winreg.SetValueEx(key, GUID_VALUE, 0, winreg.REG_SZ, new_guid)
        winreg.CloseKey(key)
        return True
    except Exception as e:
        print(f"      ERROR: {e}")
        return False

def get_network_adapters():
    adapters = []
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, ADAPTER_KEY, 0, winreg.KEY_READ)
        i = 0
        while True:
            try:
                subkey_name = winreg.EnumKey(key, i)
                subkey = winreg.OpenKey(key, subkey_name, 0, winreg.KEY_READ)
                try:
                    desc, _ = winreg.QueryValueEx(subkey, "DriverDesc")
                    adapters.append((subkey_name, desc))
                except:
                    pass
                winreg.CloseKey(subkey)
            except OSError:
                break
            i += 1
        winreg.CloseKey(key)
    except Exception as e:
        print(f"[!] Error enumerating adapters: {e}")
    return adapters

def set_mac_address(adapter_subkey, new_mac):
    full_path = f"{ADAPTER_KEY}\\{adapter_subkey}"
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, full_path, 0, winreg.KEY_SET_VALUE)
        winreg.SetValueEx(key, "NetworkAddress", 0, winreg.REG_SZ, new_mac)
        winreg.CloseKey(key)
        return True
    except Exception as e:
        print(f"      ERROR: {e}")
        return False

def delete_mac_address(adapter_subkey):
    full_path = f"{ADAPTER_KEY}\\{adapter_subkey}"
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, full_path, 0, winreg.KEY_SET_VALUE)
        winreg.DeleteValue(key, "NetworkAddress")
        winreg.CloseKey(key)
        return True
    except:
        return False

def restart_adapter(adapter_name):
    try:
        import pythoncom
        import wmi
        pythoncom.CoInitialize()
        c = wmi.WMI()
        for nic in c.Win32_NetworkAdapter(Name=adapter_name):
            nic.Disable()
            time.sleep(2)
            nic.Enable()
            time.sleep(5)
            return True
        return False
    except Exception as e:
        print(f"      ERROR: {e}")
        return False

def get_current_mac(adapter_subkey):
    full_path = f"{ADAPTER_KEY}\\{adapter_subkey}"
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, full_path, 0, winreg.KEY_READ)
        mac, _ = winreg.QueryValueEx(key, "NetworkAddress")
        winreg.CloseKey(key)
        return mac
    except:
        return "HARDWARE_DEFAULT"

# Volume serial
def download_volumeid():
    temp_dir = tempfile.mkdtemp()
    dest = os.path.join(temp_dir, "Volumeid64.exe")
    try:
        urllib.request.urlretrieve(VOLUMEID_URL, dest)
        return dest
    except Exception as e:
        print(f"      ERROR downloading VolumeID: {e}")
        return None

def get_current_volume_serial():
    try:
        output = subprocess.check_output("vol C:", shell=True, text=True)
        for line in output.splitlines():
            if "Serial Number" in line:
                return line.split("is")[-1].strip()
        return None
    except:
        return None

def set_volume_serial(volumeid_exe, new_serial):
    try:
        cmd = f'"{volumeid_exe}" C: {new_serial}'
        subprocess.check_call(cmd, shell=True, timeout=30)
        return True
    except Exception as e:
        print(f"      ERROR: {e}")
        return False

# Computer name
def get_computer_name():
    return os.environ["COMPUTERNAME"]

def set_computer_name(new_name):
    try:
        subprocess.run(
            f'wmic computersystem where name="%COMPUTERNAME%" call rename name="{new_name}"',
            shell=True, check=True, capture_output=True
        )
        os.environ["COMPUTERNAME"] = new_name
        return True
    except Exception as e:
        print(f"      ERROR: {e}")
        return False

# Proxy
def get_proxy_state():
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, PROXY_REG_PATH, 0, winreg.KEY_READ)
        enabled, _ = winreg.QueryValueEx(key, "ProxyEnable")
        server, _ = winreg.QueryValueEx(key, "ProxyServer")
        override, _ = winreg.QueryValueEx(key, "ProxyOverride")
        winreg.CloseKey(key)
        return bool(enabled), server, override
    except:
        return False, "", ""

def set_proxy(proxy_server, enable=True):
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, PROXY_REG_PATH, 0, winreg.KEY_SET_VALUE)
        if proxy_server.lower().startswith("http://"):
            proxy_server = proxy_server[7:]
        elif proxy_server.lower().startswith("https://"):
            proxy_server = proxy_server[8:]
        winreg.SetValueEx(key, "ProxyServer", 0, winreg.REG_SZ, proxy_server)
        winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 1 if enable else 0)
        winreg.CloseKey(key)
        ctypes.windll.user32.SendMessageW(0xFFFF, 0x001A, 0, 0)
        return True
    except Exception as e:
        print(f"      ERROR: {e}")
        return False

def restore_proxy(enabled, server, override):
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, PROXY_REG_PATH, 0, winreg.KEY_SET_VALUE)
        winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 1 if enabled else 0)
        winreg.SetValueEx(key, "ProxyServer", 0, winreg.REG_SZ, server)
        winreg.SetValueEx(key, "ProxyOverride", 0, winreg.REG_SZ, override)
        winreg.CloseKey(key)
        ctypes.windll.user32.SendMessageW(0xFFFF, 0x001A, 0, 0)
        return True
    except Exception as e:
        print(f"      ERROR: {e}")
        return False

# ------------------------------------------------------------
# Random generators
# ------------------------------------------------------------
def random_mac():
    first_byte = random.choice([0x02, 0x06, 0x0A, 0x0E])
    mac = [first_byte] + [random.randint(0x00, 0xff) for _ in range(5)]
    return ":".join(f"{b:02X}" for b in mac).replace(":", "-")

def random_vol_serial():
    return f"{random.randint(0,65535):04X}-{random.randint(0,65535):04X}"

def random_computer_name():
    return "PC-" + "".join(random.choices("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", k=8))

# ------------------------------------------------------------
# Main – fully automatic, no user prompts
# ------------------------------------------------------------
def main():
    global spoiled

    run_as_admin()
    print(f"[*] Running as Administrator: {is_admin()}\n")
    print("=== AUTOMATIC DEVICE SPOOFER FOR TRAE (UNLIMITED) ===\n")
    print("Keep this window open while using Trae.")
    print("Close it when you are done – all original settings will be restored.\n")

    # --- Load proxies automatically ---
    PROXY_FILE = "proxies.txt"
    proxies = []
    if os.path.exists(PROXY_FILE):
        with open(PROXY_FILE, "r") as f:
            proxies = [line.strip() for line in f if line.strip() and not line.startswith("#")]
        if proxies:
            print(f"[*] Loaded {len(proxies)} proxies from {PROXY_FILE}")
    use_proxy = bool(proxies)

    # --- Auto‑select first network adapter ---
    adapters = get_network_adapters()
    if not adapters:
        raise RuntimeError("No network adapters found. Run as Administrator and try again.")
    adapter_subkey, adapter_desc = adapters[0]
    print(f"[*] Using network adapter: {adapter_desc}\n")

    # --- Backup original values ---
    backup["guid"] = get_machine_guid()
    backup["mac"] = get_current_mac(adapter_subkey)
    backup["vol_serial"] = get_current_volume_serial()
    backup["pc_name"] = get_computer_name()
    backup["proxy_enabled"], backup["proxy_server"], backup["proxy_override"] = get_proxy_state()
    backup["adapter_subkey"] = adapter_subkey
    backup["adapter_desc"] = adapter_desc
    backup["volumeid_exe"] = download_volumeid()

    # Backup Trae's storage.json
    storage_path = os.path.expandvars(r"%APPDATA%\trae\User\globalStorage\storage.json")
    backup["storage_json_path"] = storage_path
    if os.path.isfile(storage_path):
        try:
            temp_backup = tempfile.mktemp(suffix=".json")
            shutil.copy2(storage_path, temp_backup)
            backup["storage_json_backup"] = temp_backup
            print(f"[*] Backed up storage.json ({os.path.getsize(storage_path)} bytes)")
        except Exception as e:
            print(f"[!] Could not backup storage.json: {e}")
    else:
        print("[*] No existing storage.json – a fresh one will be created.")

    print("\n" + "="*60)
    print("           BACKUP OF ORIGINAL SETTINGS")
    print("="*60)
    print(f"  MachineGuid       : {backup['guid']}")
    print(f"  MAC Address       : {backup['mac']}")
    print(f"  Volume Serial (C:): {backup['vol_serial']}")
    print(f"  Computer Name     : {backup['pc_name']}")
    print(f"  Proxy             : {'Enabled' if backup['proxy_enabled'] else 'Disabled'} ({backup['proxy_server']})")
    if backup["storage_json_backup"]:
        print(f"  storage.json      : backed up")

    # --- Generate new random values ---
    new_guid = str(uuid.uuid4())
    new_mac = random_mac()
    new_vol = random_vol_serial()
    new_pcname = random_computer_name()
    new_proxy = random.choice(proxies) if use_proxy else None

    print("\n" + "="*60)
    print("          APPLYING SPOOFED IDENTIFIERS")
    print("="*60)

    # 1. Reset storage.json (delete it so Trae creates new device IDs)
    if os.path.isfile(storage_path):
        try:
            os.remove(storage_path)
            print(f"  storage.json       : DELETED (new device ID will be generated)")
        except Exception as e:
            print(f"  storage.json       : DELETE FAILED ({e})")
    else:
        print(f"  storage.json       : not present (fresh)")

    # 2. Volume Serial
    if backup["volumeid_exe"]:
        ok = set_volume_serial(backup["volumeid_exe"], new_vol)
        status = "[OK]" if ok else "[FAILED]"
        print(f"  Volume Serial      : {backup['vol_serial']}  ->  {new_vol}  {status}")
    else:
        print(f"  Volume Serial      : SKIPPED (VolumeID not available)")

    # 3. Computer Name
    ok = set_computer_name(new_pcname)
    status = "[OK]" if ok else "[FAILED]"
    print(f"  Computer Name      : {backup['pc_name']}  ->  {new_pcname}  {status}")

    # 4. MachineGuid
    ok = set_machine_guid(new_guid)
    status = "[OK]" if ok else "[FAILED]"
    print(f"  MachineGuid        : {backup['guid']}  ->  {new_guid}  {status}")
    if not ok:
        raise RuntimeError("MachineGuid change failed – aborting. Original values will be restored.")

    # 5. MAC Address
    ok = set_mac_address(adapter_subkey, new_mac)
    status = "[OK]" if ok else "[FAILED]"
    print(f"  MAC Address        : {backup['mac']}  ->  {new_mac}  {status}")
    if not ok:
        set_machine_guid(backup["guid"])
        raise RuntimeError("MAC change failed – rolled back GUID. Original values will be restored.")

    # 6. Proxy (if available)
    if use_proxy:
        ok = set_proxy(new_proxy)
        status = "[OK]" if ok else "[FAILED]"
        print(f"  Proxy              : (none)  ->  {new_proxy}  {status}")
    else:
        print(f"  Proxy              : not available / not used")

    # Restart adapter to activate MAC
    ok = restart_adapter(adapter_desc)
    print(f"  Adapter restart    : {adapter_desc}  {'[OK]' if ok else '[FAILED]'}")

    spoiled = True

    # --- Launch Trae automatically ---
    trae_path = os.path.expandvars(r"%LOCALAPPDATA%\Programs\Trae\Trae.exe")
    print("\n" + "="*60)
    if os.path.isfile(trae_path):
        try:
            subprocess.Popen(trae_path, shell=True)
            print(f"[+] Launched: {trae_path}")
        except Exception as e:
            print(f"[!] Could not launch Trae: {e}")
    else:
        print(f"[!] Trae executable not found at:\n    {trae_path}")
        print("    Please start Trae manually.")

    print("="*60)
    print("       SPOOFING ACTIVE – YOU CAN NOW USE TRAE")
    print("="*60)
    print("Close this console window to stop and restore all original settings.")

    # Keep the window open until user closes it
    try:
        while True:
            time.sleep(10)
    except KeyboardInterrupt:
        pass

# ------------------------------------------------------------
# Entry point
# ------------------------------------------------------------
if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n[!!!] Critical error: {e}")
        traceback.print_exc()
    finally:
        print("\nConsole will stay open until you press Ctrl+C or close it.")
        try:
            while True:
                time.sleep(10)
        except KeyboardInterrupt:
            pass