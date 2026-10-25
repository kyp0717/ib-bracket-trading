# Remote Boot Plan: Wake-on-LAN via GL.iNet + Tailscale

Goal: power on the Boston PC remotely from Connecticut, then work on it.
Chosen path: a GL.iNet travel router on the Boston LAN, joined to a
Tailnet. It sends the Wake-on-LAN magic packet and provides the remote
path in. No router swap required, no ASUS cloud dependency, no port
forwarding.

## Hardware

- Boston PC: ASUS ROG STRIX B650E-F GAMING WIFI, wired Ethernet (Intel 2.5GbE)
- WoL relay: GL.iNet GL-MT3000 Beryl AX (~$80) or GL-SFT1200 Opal (~$35),
  stock firmware, in Access Point mode behind the existing Verizon CR1000A.
- Existing: Verizon Fios, CR1000A router, ONT with Ethernet WAN handoff
- Alternate main router (optional, only if a better router is wanted for
  its own sake): ASUS RT-AX68U with Merlin. An already-owned RT-AC66U
  (original, not B1) also works as a WoL sender; Merlin support caps at
  380.70 and the ASUS app remote path is uncertain on a model that old.

## Phase 1: GL.iNet setup in Boston

1. Flash to the latest stock GL firmware, factory state.
2. Set it to Access Point mode, wired to the CR1000A LAN.
3. In the GL.iNet UI, enable the Tailscale toggle and sign into the
   Tailnet. Note its Tailscale IP.
4. Install the wake tool: `opkg update && opkg install etherwake`.
5. Restrict who can reach it in the Tailscale admin console (ACLs, MFA on
   the account).

## Phase 2: Enable Wake-on-LAN on the PC

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

Write down the NIC's MAC address from `ip link`. etherwake needs it.

## Phase 3: Post-boot remote access (RDP via Remmina)

1. Install Tailscale on the Ubuntu PC so it joins the same Tailnet. The
   PC is then reachable at its own 100.x address from anywhere on the
   Tailnet, including linden and the Connecticut side.
2. Enable GNOME Remote Desktop on the PC: Settings > Sharing > Remote
   Desktop. It speaks RDP, works on Wayland, and shares the real console
   session, so the trading app left open on the monitor is the session
   you get.
3. Keep the RDP listener on the LAN/Tailscale interfaces only.
4. From the remote side: Remmina, new profile, protocol RDP, server = the
   PC's Tailscale IP, TLS on.
5. For watching charts rather than driving the desktop,
   Sunshine/Moonlight on the same Tailnet is smoother than RDP.

## Phase 4: Test in Boston before leaving

1. Shut the PC down normally (not hibernate).
2. From a Tailscale device on the same LAN: SSH to the GL.iNet and run
   `etherwake <pc-mac>`. PC should power on within a couple of seconds.
3. Confirm Remmina connects to the Tailscale IP and lands in the console
   session.
4. If the wake fails: recheck ErP Disabled, Power On By PCI-E Enabled,
   and `ethtool <iface>` showing `Wake-on: g`. Fix it while local.

## Phase 5: Use from Connecticut

1. Open Tailscale, SSH to the GL.iNet, `etherwake <pc-mac>`.
2. PC boots in Boston. Connect with Remmina over RDP to its Tailscale IP.
3. Shut down normally when done; the GL.iNet stays up and reachable.

## Failure fallbacks (only if needed)

- Raspberry Pi (owned) running Tailscale + wakeonlan, wired to the router.
- Tuya WiFi PC power card on the F_PANEL header (needs 2.4 GHz WiFi).
- ASUS Router app path if an ASUS router ever becomes the main router:
  the app reaches the router through ASUS's cloud relay, no Tailscale,
  but it covers only the wake, not the work session.

## Gotchas

- PC PSU stays plugged in and switched on 24/7; draws 1-3 W off.
- If the breaker trips or PSU is switched off, nothing can wake it.
- Consider BIOS "Restore on AC Power Loss: Power On" as an outage
  recovery safety net.
- The GL.iNet needs the home internet up; an outage kills every remote
  path equally.
