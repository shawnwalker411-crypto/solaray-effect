/**
 * SOLA RAY EFFECT — Master Glossary Data
 * ========================================
 * Single source of truth for all glossary terms site-wide.
 * Each page loads this file instead of maintaining its own local copy.
 *
 * STRUCTURE:
 *   title       — Display name shown in drawer heading
 *   definition  — Plain-text definition shown in drawer body
 *   ebay        — (optional) eBay search URL with affiliate params
 *   amazon      — (optional) Amazon search URL (non-affiliate until approved)
 *   official    — (optional) Official product/service website URL
 *
 * CATEGORIES:
 *   No ebay/amazon/official  = Definition only (concept)
 *   ebay and/or amazon       = Purchasable product
 *   official only            = Software / service
 *
 * AFFILIATE NOTE:
 *   eBay links include campid=5339142622 (active affiliate).
 *   Amazon links are plain search URLs (non-affiliate) until approved.
 *   customid uses prefix: gl_ = glossary source.
 */

var SOLA_GLOSSARY = {

  /* ================================================
     MINING HARDWARE — Purchasable Products
     ================================================ */

  "asic": {
    title: "ASIC",
    definition: "Application-Specific Integrated Circuit \u2014 specialized hardware designed solely for cryptocurrency mining. Unlike general-purpose computers, ASICs are optimized for a specific mining algorithm, making them extremely efficient but limited to mining particular cryptocurrencies.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=asic+miner&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_asic&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=asic+miner"
  },

  "control-board": {
    title: "Control Board",
    definition: "The management board inside a miner that handles networking, configuration, and coordination of hashboards.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=antminer+s19+control+board&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_control_board&toolid=10001&mkevt=1"
  },

  "hashboard": {
    title: "Hashboard",
    definition: "The board in an ASIC miner containing the hashing chips. Multiple hashboards provide total hashrate.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=antminer+s19+hashboard&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_hashboard&toolid=10001&mkevt=1"
  },

  "apw12": {
    title: "APW12",
    definition: "A Bitmain power supply commonly used with S19-series miners (verify model and connector compatibility).",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=bitmain+apw12+power+supply&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_apw12&toolid=10001&mkevt=1"
  },

  "antminer-s19-pro": {
    title: "Antminer S19 Pro",
    definition: "Bitmain's flagship SHA-256 Bitcoin miner. Produces ~110 TH/s at ~3,250W. One of the most widely deployed miners for home and small-scale operations.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=antminer+s19+pro&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_s19pro&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=antminer+s19+pro"
  },

  "antminer-s19j-pro": {
    title: "Antminer S19j Pro",
    definition: "An upgraded S19 variant from Bitmain. Produces ~104 TH/s at ~3,068W with improved efficiency over the original S19.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=antminer+s19j+pro&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_s19jpro&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=antminer+s19j+pro"
  },

  "antminer-l3plus": {
    title: "Antminer L3++",
    definition: "Bitmain's Scrypt algorithm miner used for Litecoin and Dogecoin. Produces ~580 MH/s at ~942W. Widely available on the secondary market.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=antminer+l3%2B%2B&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_l3plus&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=antminer+l3%2B%2B"
  },

  "antminer-ks5": {
    title: "Antminer KS5",
    definition: "Bitmain's KHeavyHash algorithm miner designed for Kaspa (KAS). Produces ~20 TH/s at ~3,400W.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=antminer+ks5&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_ks5&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=antminer+ks5"
  },

  "psu": {
    title: "PSU (Power Supply Unit)",
    definition: "Converts AC power from your wall outlet to DC power that your miner needs. Must be rated for your miner's wattage plus 10-20% headroom. Critical for reliability and safety. Most ASIC miners come with a PSU, but replacements or upgrades may be needed.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=antminer+power+supply&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_psu&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=antminer+power+supply"
  },

  /* ================================================
     POWER DISTRIBUTION — Purchasable Products
     ================================================ */

  "pdu": {
    title: "PDU",
    definition: "Power Distribution Unit. In mining, a switched or metered PDU enables remote power cycling and load visibility for stability.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=switched+pdu+240v&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_pdu&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=mining+pdu+240v"
  },

  "switched-pdu": {
    title: "Switched PDU",
    definition: "A PDU that allows you to remotely turn outlets on/off for recovery without physical access.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=switched+pdu+240v&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_switched_pdu&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=switched+pdu+240v"
  },

  "metered-pdu": {
    title: "Metered PDU",
    definition: "A PDU that measures electrical load (amps/watts) so you can track stability and avoid overload.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=metered+pdu+240v&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_metered_pdu&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=metered+pdu+240v"
  },

  "intelligent-pdu": {
    title: "Intelligent PDU",
    definition: "A fully featured PDU combining power distribution, real-time metering, remote outlet switching, environmental sensors, and network alerts \u2014 the all-in-one option for serious mining setups.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=intelligent+pdu+240v&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_intelligent_pdu&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=intelligent+pdu+240v"
  },

  "ups": {
    title: "UPS",
    definition: "Uninterruptible Power Supply. Provides short runtime during outages and can smooth power events for network gear and controllers.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=mini+ups+router+raspberry+pi&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_ups&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=mini+ups+battery+backup"
  },

  /* ================================================
     ELECTRICAL PANEL — Purchasable Products
     ================================================ */

  "din-rail": {
    title: "DIN Rail",
    definition: "A standardized metal rail used inside electrical panels to mount components like relays, contactors, and monitoring modules.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=din+rail+kit&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_din_rail&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=din+rail+kit"
  },

  "smart-relay": {
    title: "Smart Relay",
    definition: "A controllable electrical switch used for automation and remote load control (often DIN-rail mounted for panels).",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=smart+relay+din+rail+wifi&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_smart_relay&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=smart+relay+din+rail+wifi"
  },

  "contactor": {
    title: "Contactor",
    definition: "An electrically controlled high-current switch. Often used when relays cannot safely handle the load.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=din+rail+contactor&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_contactor&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=din+rail+contactor"
  },

  "smart-panel": {
    title: "Smart Panel",
    definition: "A breaker panel with monitoring and sometimes control features (per-circuit measurement, alerts, or remote toggling depending on model).",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=smart+breaker+panel&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_smart_panel&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=smart+breaker+panel"
  },

  "altair-virgo": {
    title: "Altair Virgo Smart PDU",
    definition: "A 30A/240V switched PDU with per-outlet remote control via web interface. Supports SNMP, Modbus, HTTP/HTTPS, and email alerts. The only 30A/240V switched PDU available at retail for home miners as of early 2026. L6-30P input, 4\u00d7C13 + 2\u00d7C19 outlets. Sold direct from Altair Technology only.",
    official: "https://altairtech.io/product/virgo-smart-pdu-30a-1u-240v-7500w-l6-30p/"
  },

  "altair-argo": {
    title: "Altair Argo Metered PDU",
    definition: "A 30A/240V metered PDU with an LCD display showing amps, watts, and kWh. Has an overload protection breaker but no surge protection and no remote switching. L6-30P input, 4\u00d7C13 + 2\u00d7C19 outlets. Used with a WiFi pool pump timer for remote power control on a budget.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=altair+argo+metered+pdu&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_altair_argo&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=Altair+Argo+metered+PDU+30A+240V"
  },

  "autoping": {
    title: "AutoPing",
    definition: "A feature that automatically power-cycles a miner when it stops responding to network pings. The device pings each miner at regular intervals. After several consecutive failures, it cuts and restores power to that outlet, forcing a reboot. No retail 30A/240V switched PDU currently includes AutoPing \u2014 but you can build the same functionality with a simple script on a Raspberry Pi."
  },

  /* ================================================
     ELECTRICAL CONCEPTS — Definitions from electrical_setup
     ================================================ */

  "nema": {
    title: "NEMA",
    definition: "National Electrical Manufacturers Association. The organization that sets standards for electrical outlets and plugs in North America. When you see \"NEMA 6-20\" on a miner's specs, it refers to a specific outlet type."
  },

  "nema515": {
    title: "NEMA 5-15 / 5-20",
    definition: "Standard 120V household outlets. The 5-15 (15A) is the common 3-prong outlet in every room. The 5-20 (20A) has one sideways slot and is typically in kitchens and garages. Most Loki-modified miners plug into these. The \"5\" means 120V grounded, the number after the dash is the amperage rating."
  },

  "nema620": {
    title: "NEMA 6-20R",
    definition: "A 240V/20A outlet. The \"6\" indicates 240V, \"20\" is the amperage, \"R\" means receptacle (outlet). Provides up to 3,840W continuous (at 80%). Common for window AC units and smaller industrial equipment.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=nema+6-20r+outlet&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_nema620&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=nema+6-20r+outlet"
  },

  "nemal630": {
    title: "NEMA L6-30R",
    definition: "A 240V/30A locking outlet. The \"L\" means twist-lock \u2014 the plug locks in place to prevent accidental disconnection. Provides up to 5,760W continuous (at 80%). Popular for multiple miners via a PDU. Locking outlets are preferred for mining \u2014 vibration from fans won't shake the plug loose.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=nema+l6-30r+outlet&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_nemal630&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=nema+l6-30r+outlet"
  },

  "rule80": {
    title: "80% Rule",
    definition: "NEC requirement that continuous loads (running 3+ hours) use no more than 80% of circuit capacity. A 20A circuit = 16A max continuous. A 30A circuit = 24A max continuous. Mining is always a continuous load, so size your circuits with 20% headroom. Violating this is a fire hazard."
  },

  "doublepole": {
    title: "Double-Pole Breaker",
    definition: "A circuit breaker that controls both hot wires in a 240V circuit simultaneously. Required for all 240V circuits. Takes two slots in your breaker panel. Trips both legs if either overloads.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=double+pole+circuit+breaker+240v&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_doublepole&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=double+pole+circuit+breaker+240v"
  },

  "awg": {
    title: "Wire Gauge (AWG)",
    definition: "American Wire Gauge \u2014 the standard for measuring wire thickness in the US. Lower numbers = thicker wire = more capacity. For mining: 12 AWG handles 20A circuits, 10 AWG handles 30A circuits. Using too-thin wire is a fire hazard. When in doubt, go one size thicker.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=10+awg+wire+romex&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_awg&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=10+awg+wire+romex"
  },

  "nec": {
    title: "NEC (National Electrical Code)",
    definition: "The US standard for safe electrical installation (NFPA 70). Covers wiring, outlets, breakers, and everything else electrical. Most jurisdictions require NEC compliance. Electricians follow this code \u2014 and so should you for any DIY work."
  },

  "voltage": {
    title: "120V vs 240V",
    definition: "Standard US outlets are 120V (15-20A). Dryers and ovens use 240V. Most industrial ASICs need 240V but can run on 120V with a Loki Kit or modifications. 240V is more efficient (less heat loss in wiring)."
  },

  /* ================================================
     SOFTWARE / FIRMWARE — Official Site Links
     ================================================ */

  "luxos": {
    title: "LuxOS",
    definition: "Third-party ASIC firmware focused on tuning, monitoring, and fleet management features.",
    official: "https://luxor.tech/firmware"
  },

  "braiins-os": {
    title: "Braiins OS",
    definition: "ASIC firmware focused on transparency and efficiency tuning, with features like autotuning on supported devices.",
    official: "https://braiins.com/os-firmware"
  },

  "tailscale": {
    title: "Tailscale",
    definition: "A mesh VPN built on WireGuard that makes secure remote access simple without exposing ports to the internet.",
    official: "https://tailscale.com"
  },

  "headscale": {
    title: "Headscale",
    definition: "A self-hosted control server compatible with Tailscale clients. Used when you want full control of coordination.",
    official: "https://headscale.net"
  },

  "wireguard": {
    title: "WireGuard",
    definition: "A modern, lightweight VPN protocol focused on speed and strong cryptography. Used under the hood by Tailscale.",
    official: "https://www.wireguard.com"
  },

  "firmware": {
    title: "Firmware",
    definition: "Firmware is the software embedded in your mining hardware that controls its operation. Aftermarket firmware replaces manufacturer software to unlock features like overclocking, undervolting, and efficiency improvements."
  },

  "aftermarket-firmware": {
    title: "Aftermarket Firmware",
    definition: "Third-party firmware (LuxOS, VNish, BraiinsOS) that replaces the manufacturer's software on ASIC miners. Benefits include underclocking/overclocking, better efficiency tuning, and Loki Kit compatibility."
  },

  /* ================================================
     MINING CONCEPTS — Definition Only
     ================================================ */

  "hashrate": {
    title: "Hashrate",
    definition: "How fast a miner computes hashes. Higher hashrate generally increases expected earnings, but power and heat rise too. Measured in H/s, KH/s, MH/s, GH/s, TH/s, or PH/s depending on the algorithm."
  },

  "algorithm": {
    title: "Algorithm",
    definition: "The cryptographic puzzle that miners must solve to validate transactions and earn rewards. Different cryptocurrencies use different algorithms: SHA-256 (Bitcoin), Scrypt (Litecoin), KHeavyHash (Kaspa), Etchash (Ethereum Classic), Equihash (Zcash), X11 (Dash), KAWPOW (Ravencoin)."
  },

  "difficulty": {
    title: "Difficulty",
    definition: "A network parameter that adjusts how hard it is to find blocks. Higher difficulty reduces expected coins at the same hashrate. Adjusts automatically every ~2,016 blocks based on total network hashrate."
  },

  "uptime": {
    title: "Uptime",
    definition: "The percent of time your miners are hashing as expected. Stability infrastructure exists to protect uptime."
  },

  "redundancy": {
    title: "Redundancy",
    definition: "Spare components or alternate paths (power/network) that reduce downtime when something fails."
  },

  "efficiency": {
    title: "Efficiency",
    definition: "Mining efficiency is measured in watts per unit of hashrate (e.g., J/TH for Bitcoin). Lower numbers mean less electricity to produce the same mining output \u2014 critical for profitability."
  },

  "overclocking": {
    title: "Overclocking",
    definition: "Overclocking pushes your miner beyond factory settings for higher hashrate. This increases heat and power consumption but can boost earnings. Requires careful tuning and adequate cooling."
  },

  "undervolting": {
    title: "Undervolting",
    definition: "Undervolting reduces the voltage supplied to mining chips. This lowers power consumption and heat while maintaining hashrate, improving efficiency and profitability."
  },

  "devfee": {
    title: "Dev Fee",
    definition: "Dev fee is a percentage of your mining time/rewards that goes to the firmware developers. Typically 2-3% for aftermarket firmware. This compensates developers for creating and maintaining the software."
  },

  "fpps": {
    title: "FPPS",
    definition: "Full Pay Per Share. A payout method that pays per share and typically includes transaction fees (depends on pool)."
  },

  "pplns": {
    title: "PPLNS",
    definition: "Pay Per Last N Shares. Rewards are distributed based on recent shares; variance can be higher but fees may differ."
  },

  "solo-mining": {
    title: "Solo Mining",
    definition: "Mining without a pool. You only earn when you find a full block; payouts are rare and highly variable."
  },

  "solo": {
    title: "Solo Mining",
    definition: "You only get paid if your specific work finds a block. Extremely high variance with potentially massive reward. With small hashrate, you may never find a block. Recommended only for fun or lottery purposes with extra hashrate you can afford to lose."
  },

  "pps": {
    title: "PPS / PPS+ (Pay Per Share)",
    definition: "PPS pays a fixed amount for each valid share, regardless of whether the pool finds a block. PPS+ adds a share of transaction fees on top. This hybrid approach balances predictability with potential upside during high-fee periods."
  },

  "failover-pool": {
    title: "Failover Pool",
    definition: "A backup pool configuration that automatically takes over if the primary pool is unreachable."
  },

  "pool": {
    title: "Mining Pool",
    definition: "A group of miners who combine their hashrate and share rewards proportionally. Pools provide steady, predictable income instead of waiting months/years to find a block solo. Most home miners use pools."
  },

  "roi": {
    title: "ROI (Return on Investment)",
    definition: "A measure of how profitable your mining investment is. Calculated as (annual profit / purchase cost) \u00D7 100%. Higher ROI = better investment. \"Days to break even\" shows when you've recovered your initial cost."
  },

  "mining-type": {
    title: "Mining Type",
    definition: "The category of mining hardware. ASIC miners are specialized chips built for one algorithm \u2014 extremely efficient but single-purpose. Lottery miners are low-power USB or small devices with very low hashrate, used mainly for fun or education with a tiny chance of hitting a full block reward."
  },

  "lottery": {
    title: "Lottery Miner",
    definition: "Low-power USB or small ASIC miners (like Bitaxe, NerdMiner) that have very low hashrate but give you a chance to solo mine a full block reward. Called \"lottery\" because winning is rare but the payout is huge if you do.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=bitaxe+miner&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_lottery&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=bitaxe+miner"
  },

  "loki-kit": {
    title: "Loki Kit",
    definition: "A hardware modification that allows industrial ASIC miners (designed for 240V) to run on standard 120V household outlets. The kit runs only one hash board at reduced power (~1200W), providing roughly 40% of full hashrate. Requires aftermarket firmware like LuxOS or VNish.",
    official: "/aftermarket_firmware.html#loki-vendors"
  },

  "raspberry-pi": {
    title: "Raspberry Pi",
    definition: "A small, low-power single-board computer commonly used as a subnet router for remote miner management. A Raspberry Pi 4 or 5 running Tailscale or Headscale lets you access your entire mining LAN from anywhere.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=raspberry+pi+4+kit&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_raspberry_pi&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=raspberry+pi+4+kit"
  },

  "shelly": {
    title: "Shelly Pro Relay",
    definition: "A DIN-rail mountable smart relay used to remotely control and monitor power to miners. The Shelly Pro 1PM handles one circuit; the Pro 4PM handles four. Both report real-time wattage and can be triggered by automation rules.",
    ebay: "https://www.ebay.com/sch/i.html?_nkw=shelly+pro+1pm&mkcid=1&mkrid=711-53200-19255-0&siteid=0&campid=5339142622&customid=gl_shelly&toolid=10001&mkevt=1",
    amazon: "https://www.amazon.com/s?k=shelly+pro+1pm"
  },

  /* ================================================
     NETWORKING — Definition Only
     ================================================ */

  "mesh-vpn": {
    title: "Mesh VPN",
    definition: "A software VPN that connects devices directly in a private network (often peer-to-peer), so you can reach miners securely without port forwarding."
  },

  "subnet-router": {
    title: "Subnet Router",
    definition: "A device (often a Raspberry Pi) that routes a private LAN subnet into your VPN so you can access miners and web UIs remotely as if you were at home."
  },

  "cgnat": {
    title: "CGNAT",
    definition: "Carrier-Grade NAT. Your ISP places you behind shared public IPs, which often breaks inbound port forwarding. A mesh VPN avoids this problem."
  },

  "port-forwarding": {
    title: "Port Forwarding",
    definition: "A router setting that exposes an internal device/service to the public internet. High-risk if misconfigured; avoid when possible."
  },

  "static-ip": {
    title: "Static IP",
    definition: "A public IP address that does not change. Can simplify remote access when you must use traditional networking methods."
  },

  "vlan": {
    title: "VLAN",
    definition: "A virtual LAN that logically separates devices on the same physical network. Used to isolate miners from home devices and reduce network noise."
  },

  "segmentation": {
    title: "Segmentation",
    definition: "Separating devices into distinct network or power zones to improve reliability and security."
  },

  "broadcast-traffic": {
    title: "Broadcast Traffic",
    definition: "Network packets sent to all devices on a LAN. Too much broadcast noise can destabilize large miner deployments."
  },

  /* ================================================
     OPERATIONAL CONCEPTS — Definition Only
     ================================================ */

  "derating": {
    title: "Derating",
    definition: "Running hardware below its maximum rating to improve safety and long-term reliability."
  },

  "continuous-load": {
    title: "Continuous Load",
    definition: "A load expected to run for 3+ hours. Often sized at ~80% of circuit rating for safety (check local code)."
  },

  "watchdog": {
    title: "Watchdog",
    definition: "A monitoring mechanism that triggers a restart or recovery action when a system becomes unresponsive."
  },

  /* ================================================
     DATA VAULT TERMS — Definition Only
     ================================================ */

  "block-reward": {
    title: "Block Reward",
    definition: "The amount of cryptocurrency awarded to a miner (or pool) for successfully mining a block. For Bitcoin, the block reward halves approximately every four years. The current reward defines the maximum new BTC entering circulation per block."
  },

  "hashprice": {
    title: "Hashprice",
    definition: "What one terahash of mining power earns per day in USD. This is the bottom-line number \u2014 it accounts for difficulty, price, and fees all in one. Compare this against your electricity cost per TH to know if you're profitable."
  }

};
