#!/bin/bash

check_ssh_status() {
    if nc -zv $1 22 &>/dev/null; then
        return 0
    else
        return 1
    fi
}

check_rdp_status() {
    if nc -zv $1 3389 &>/dev/null; then
        return 0
    else
        return 1
    fi
}

check_ping() {
    if ping -c 1 $1 &>/dev/null; then
        return 0
    else
        return 1
    fi
}

while true; do
    clear

    echo $'\e[1;34m'
    echo " ╔══════════════════════════════════════════════════════════╗"
    echo " ║                   PHONEBANK & SERVER CHECKER             ║"
    echo " ║                                                          ║"
    echo " ║                                                          ║"
    echo " ║                                                          ║"
    echo " ║                                                          ║"
    echo " ║                                                          ║"
    echo " ╚══════════════════════════════════════════════════════════╝"
    
    read -p $' Masukkan alamat IP (\e[1;31m\'exit\'\e[1;34m untuk keluar):\e[0m ' IP_ADDRESS

    if [ "$IP_ADDRESS" == "exit" ]; then
        echo $'\e[1;31m ║  Keluar dari skrip.\e[0m'
        break
    fi

    check_ping $IP_ADDRESS
    if [ $? -eq 0 ]; then
        echo $'\e[1;32m ║  Koneksi ke alamat IP aktif.\e[0m'
    else
        echo $'\e[1;31m ║  Tidak dapat terhubung ke alamat IP.\e[0m'
    fi

    check_ssh_status $IP_ADDRESS
    if [ $? -eq 0 ]; then
        echo $'\e[1;32m ║  SSH aktif pada\e[0m' $IP_ADDRESS $'\e[1;32m.\e[0m'
    else
        echo $'\e[1;31m ║  SSH tidak aktif pada\e[0m' $IP_ADDRESS $'\e[1;31m.\e[0m'
    fi

    check_rdp_status $IP_ADDRESS
    if [ $? -eq 0 ]; then
        echo $'\e[1;32m ║  Remote Desktop (RDP) aktif pada\e[0m' $IP_ADDRESS $'\e[1;32m.\e[0m'
    else
        echo $'\e[1;31m ║  Remote Desktop (RDP) tidak aktif pada\e[0m' $IP_ADDRESS $'\e[1;31m.\e[0m'
    fi
    echo $'\e[1;34m ╚══════════════════════════════════════════════════════════╝\e[0m'

    read -p " Tekan [Enter] untuk melanjutkan..."
done
