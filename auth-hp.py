import subprocess

def authorize_adb():
    adb_command = "adb root && adb pull /data/misc/adb/adb_key /path/to/adbkey"
    
    try:
        result = subprocess.run(adb_command, shell=True, check=True, capture_output=True)
        print("File adbkey berhasil diambil dari perangkat.")
        print(result.stdout.decode('utf-8')) 
    except subprocess.CalledProcessError as e:
        print("Error:", e)
        print("Gagal mengambil file adbkey dari perangkat.")

if __name__ == "__main__":
    authorize_adb()
