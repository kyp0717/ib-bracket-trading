# Remote Boot Plan: Wake-on-LAN via ASUS Router

Goal: power on the Boston PC remotely from Connecticut.
Chosen path: replace the Verizon CR1000A with an ASUS RT-AX68U
(Merlin firmware) that can send the Wake-on-LAN magic packet itself.
No relay device, no Tuya card, no port forwarding.

## Hardware

- Boston PC: ASUS ROG STRIX B650E-F GAMING WIFI, wired Ethernet (Intel 2.5GbE)
- New router: ASUS RT-AX68U, Asuswrt-Merlin pre-flashed (used unit)
- Existing: Verizon Fios, CR1000A router, ONT with Ethernet WAN handoff

## Phase 1: Router arrival, used-unit hygiene

1. Factory reset from the Merlin UI:
   Administration > Restore/Save/Upload Setting > Factory default,
   tick "initialize all settings".
2. Set a new admin password.
3. Update to the latest Merlin release from the official site.
4. Never trust a used router's prior config (DNS, remote access, DDNS).

## Phase 2: Fios router swap

1. Log into the CR1000A (192.168.1.1) and release the DHCP lease
   under Broadband/WAN settings, then power it off.
2. Move the ONT Ethernet cable to the ASUS WAN port.
3. Run the ASUS setup wizard, confirm internet is up.
4. If no internet after 5 minutes, power-cycle the ONT (30 seconds off).
5. Fios TV note: if set-top boxes exist, keep the CR1000A bridged
   behind the ASUS (or a MoCA adapter) so guide data keeps working.
6. No call to Verizon needed. Exception: if WAN arrives over coax
   (older installs), Verizon must remotely switch the ONT to Ethernet.

## Phase 3: Enable Wake-on-LAN on the PC

BIOS (F2/Del at boot):

- Advanced > APM Configuration > Power On By PCI-E: Enabled
- Advanced > APM Configuration > ErP: Disabled
  (ErP cuts standby power to the NIC, which kills WoL)

Linux:

```bash
# find the interface name
ip link

# check current WoL state (want "Supports Wake-on: g" and "Wake-on: g")
sudo ethtool <iface>

# enable magic packet wake, persist via NetworkManager
nmcli c show
sudo nmcli c mod "<connection-name>" 802-3-ethernet.wake-on-lan magic
```

Write down the NIC's MAC address from `ip link`. The ASUS WoL tool
needs it.

## Phase 4: Router-side WoL and remote access

1. Merlin UI > Network Tools > Wake on LAN: confirm the tool exists
   and can see the PC's MAC.
2. Enable remote access for the ASUS Router phone app
   (AiCloud/remote connection in the app settings).
3. Optional hardening later via Merlin's SSH + Entware: etherwake,
   or Tailscale as a second path in.

## Phase 5: Test in Boston before leaving

1. Shut the PC down normally (not hibernate).
2. From the ASUS Router app or the Merlin WoL tool, send the packet
   to the PC's MAC.
3. PC should power on within a couple of seconds.
4. If it fails: recheck ErP Disabled, Power On By PCI-E Enabled,
   and `ethtool <iface>` showing `Wake-on: g`. Fix it while local.

## Phase 6: Use from Connecticut

1. Open the ASUS Router app, connect remotely.
2. Network Tools > Wake on LAN > pick the PC > send.
3. PC boots in Boston; then connect for real work via SSH or remote
   desktop (RustDesk, Sunshine/Moonlight).

## Failure fallbacks (only if needed)

- GL.iNet GL-SFT1200 Opal (~$35) or GL-MT3000 Beryl AX (~$80) in
  Access Point mode behind the ASUS, Tailscale toggle + etherwake.
- Raspberry Pi (owned) running Tailscale + wakeonlan, wired to router.
- Tuya WiFi PC power card on the F_PANEL header (needs 2.4 GHz WiFi).

## Gotchas

- PC PSU stays plugged in and switched on 24/7; draws 1-3 W off.
- If the breaker trips or PSU is switched off, nothing can wake it.
- Consider BIOS "Restore on AC Power Loss: Power On" as an outage
  recovery safety net.
