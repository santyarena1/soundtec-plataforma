# Convenciones de diseño de sistema de los fabricantes → reglas para el Room Builder

**Fecha:** 2026-10-10
**Alcance:** reglas de *diseño de sistema* (qué va con qué, cuántos por ambiente, topologías, límites, licencias, requisitos). No incluye puertos de producto (ya cargados).
**Marcas/plataformas:** Crestron Home, Crestron 4-Series programado, infiNET EX / gateways, Cresnet, Zūm (Mesh / Net / Link), cortinas Crestron, DM NAX, AirMedia, Crestron Flex / Teams Rooms, Sonance (DSP, Sonamp, Blaze PowerZone), SoundTube (IPD Dante, 70V).

## Cómo leer este documento

- Cada regla tiene: **id**, **regla** (condición → requisito), **por qué**, **fuente** (URL) y **cita** (texto original en inglés, 25 palabras como máximo).
- **Severidad sugerida para el motor:** `bloquea` (el sistema no funciona o no está soportado), `advierte` (funciona pero fuera de buenas prácticas o recomendación), `sugiere` (convención).
- Las reglas sin documento oficial están marcadas como **convención de integrador (sin fuente oficial)**.
- Todo lo citado se leyó el 2026-10-10 en las páginas oficiales (crestron.com, docs.crestron.com, sonance.com / salsify de Sonance, soundtube.com y su API de catálogo). Ninguna cita es de memoria.
- **No se pudo confirmar** (y por lo tanto no se convirtió en regla): un "PRO4-R" residencial (no existe; ver CH-01), una licencia por procesador de Crestron Home (no la encontré; ver CH-05), la impedancia mínima del DM-NAX-8ZSA (solo publica potencia a 8 y 4 Ω), el mínimo de impedancia por canal no puenteado del Sonamp 12-50, el sucesor del AM-3200 y la guía de pareo de Sonance para parlantes de techo (más allá de la tabla de subwoofers de Blaze).

---

## 1. Reglas por marca / plataforma

### 1.1 Crestron Home (residencial, sin programación)

| id | Regla (condición → requisito) | Por qué | Severidad |
|---|---|---|---|
| CH-01 `crestron-home-procesador` | Proyecto Crestron Home → exactamente 1 procesador **padre** de la línea residencial: CP4-R, DIN-AP4-R o MC4-R (PC4-R está discontinuado). **No existe PRO4-R**; PRO4 es un procesador programado y también está discontinuado. | El sistema operativo Crestron Home solo corre en esos procesadores. | bloquea |
| CH-02 `crestron-home-procesador-por-tamano` | Casa grande, home theater o MDU → CP4-R. Chica o mediana → MC4-R o DIN-AP4-R. Montaje en tablero DIN → DIN-AP4-R. | Así segmenta el fabricante (ver tabla de capacidades en §3). | sugiere |
| CH-03 `crestron-home-multiprocesador` | Más dispositivos de los que soporta un procesador → 1 padre + hasta 10 hijos. Los **hijos solo controlan iluminación, cortinas y teclados**, y se recomienda un CP4-R como padre. | Así escala Crestron Home: el audio, el video y las interfaces quedan en el padre. | bloquea (si hay AV en un hijo) |
| CH-04 `crestron-home-ui-en-padre` | Touch screens y controles remotos → se emparejan con el procesador **padre**. | Si se emparejan con un hijo, solo ven los dispositivos de ese hijo. | advierte |
| CH-05 `crestron-home-licencias` | Crestron Home → no hay que presupuestar licencia BACnet: la licencia completa viene incluida. Para el Configurator online (preconfigurar en oficina) hace falta ser dealer residencial con suscripción a myCrestron Residential Monitoring Service. **No encontré** una licencia por procesador para Crestron Home. | Afecta el presupuesto y el proceso de puesta en marcha. | sugiere |
| CH-06 `crestron-home-no-crestron-connected` | Displays o dispositivos "Crestron Connected" → **no** son compatibles con Crestron Home; se usan Crestron Drivers (drivers.crestron.io). Los teclados de terceros Crestron Connected sí están soportados. | Evita cotizar integraciones que no funcionan. | bloquea |
| CH-07 `crestron-home-touch-series` | Touch screen para Crestron Home → series TSW/TS-x70 (o x60), TST-1080 o TSR-310. La serie TSW-xx52 **no** está soportada, y tampoco la TS-1542 ni la TSD-2020. | Lista "Works with Crestron Home". | bloquea |
| CH-08 `crestron-home-dm-room-box` | Receptor DigitalMedia (DM-RMC) en Crestron Home → requiere un switcher DigitalMedia. | Los room boxes no funcionan solos en Crestron Home. | bloquea |
| CH-09 `crestron-home-cortinas-fuente-cuenta-gateway` | CSA-PWS10S-HUB(-ENET) en Crestron Home → se cuenta como **gateway** en los límites del sistema. | Consume cupo de gateways cableados (máximo 14). | advierte |
| CH-10 `crestron-home-nax-perfiles` | Varios DM NAX en un mismo sistema → todos sin perfil o con perfiles iguales, y la zona horaria del NAX igual a la del procesador. | Es requisito de emparejamiento. | advierte |

Fuentes y citas:
- CH-01 / CH-02: https://docs.crestron.com/en-us/8525/Content/CP4R/Overview/Overview-Processors.htm. Cita: *"The Crestron Home OS is controlled using CP4-R, MC4-R, PC4-R, and DIN-AP4-R control processors."* PRO4 discontinuado: https://www.crestron.com/Products/Catalog/Inactive/Discontinued/P/PRO4 (lo devuelve el buscador del catálogo). PC4-R discontinuado: https://www.crestron.com/Products/Catalog/Inactive/Discontinued/P/PC4-R. Segmentación por tamaño: https://docs.crestron.com/en-us/8525/Content/CP4R/Appendix/Works-With-Crestron-Home/Control-Systems.htm. Cita: *"CP4-R … for Mid-sized to Large Homes; DIN-AP4-R … for Small to Mid-sized Homes; MC4-R … for Small to Mid-sized Homes"*.
- CH-03: https://docs.crestron.com/en-us/8525/Content/CP4R/Design/System-Design-Max-System-Size.htm. Cita: *"Up to ten child processors (and one parent processor) can be used… Child processors are limited to control of lighting, shading, and keypad devices."* **Discrepancia:** la página https://docs.crestron.com/en-us/8525/Content/CP4R/Installer-Config/Step-2/Pair-Multiple-Processors.htm dice *"The parent processor can claim up to four child processors"*. Para procesadores V1 (discontinuados) el límite es 4. El motor debería usar 10 para CP4-R/MC4-R/DIN-AP4-R actuales y 4 para los V1. Además, todos los procesadores deben tener firmware 3.21 o posterior.
- CH-04: misma página Pair-Multiple-Processors. Cita: *"Pair user interface devices (touch screens and handheld remotes) with parent processor only."*
- CH-05: Max-System-Size. Cita: *"The full BACnet network/IP license is included with Crestron Home processors… No additional purchase required."* Configurator: https://docs.crestron.com/en-us/8525/Content/CP4R/Crestron-Home-Configurator/About.htm. Cita: *"The user must be a Crestron residential dealer"* y *"subscription to myCrestron Residential Monitoring Service"*.
- CH-06: https://docs.crestron.com/en-us/8525/Content/CP4R/Overview/Overview-Supported-Devices.htm. Cita: *"Crestron Connected devices are not compatible with Crestron Home systems."* Teclados de terceros: https://docs.crestron.com/en-us/8525/Content/CP4R/Appendix/Works-With-Crestron-Home/Keypads.htm. Cita: *"Crestron Connected® third-party keypads are supported."*
- CH-07: https://docs.crestron.com/en-us/8525/Content/CP4R/Appendix/Works-With-Crestron-Home/Touch-Screens.htm. Cita: *"The TSW-x52 series touch screens are supported in Crestron Pyng OS 1 only. For Crestron Home OS, use TSW-xx60 series."*
- CH-08: https://docs.crestron.com/en-us/8525/Content/CP4R/Appendix/Works-With-Crestron-Home/Video.htm. Cita: *"DigitalMedia Room Boxes require a DigitalMedia Switcher to work with Crestron Home."*
- CH-09: https://docs.crestron.com/en-us/8525/Content/CP4R/Appendix/Works-With-Crestron-Home/Shading.htm. Cita: *"The power supplies listed below are counted as Gateways in the Crestron Home system."*
- CH-10: https://docs.crestron.com/en-us/8525/Content/CP4R/Installer-Config/Step-2/Pair-DM-NAX.htm. Cita: *"ensure that each one has either no profile or matching profiles."*

### 1.2 Procesadores: gateway integrado y alimentación Cresnet

| id | Regla | Por qué | Severidad |
|---|---|---|---|
| PROC-01 `mc4r-gateway-integrado` | MC4-R → trae gateway infiNET EX integrado, así que no necesita CEN-GW1 en sistemas chicos. CP4-R y DIN-AP4-R → **no** tienen radio, así que hay que agregar un gateway externo si hay un solo dispositivo inalámbrico. | Evita tanto olvidar el gateway como agregar uno que sobra. | bloquea (falta gateway) |
| PROC-02 `mc4r-cresnet-poder` | MC4-R con teclados o dispositivos Cresnet → hace falta una fuente Cresnet externa: el MC4-R entrega solo 2,5 W y un teclado Horizon 2 o Cameo 2 Cresnet consume 2 W. | Sin fuente no alcanza ni para dos teclados. | bloquea |
| PROC-03 `cp4r-cresnet-poder` | CP4-R → entrega 24 W de Cresnet solo si se usa su fuente incluida. Si la suma de consumos Cresnet supera los 24 W, hay que agregar una fuente Cresnet. Con teclados de 2 W, el tope teórico son unos 12 teclados (cálculo propio con datos oficiales). | Presupuesto de potencia del bus. | bloquea |
| PROC-04 `mc4r-poe` | MC4-R → se alimenta por PoE 802.3at/af: va al switch PoE o a un inyector PWE-4803RU. Con ese inyector, el Ethernet queda limitado a 100 Mbps. | Es un requisito de instalación. | advierte |
| PROC-05 `cp4n-subnet-sin-poe` | CP4N (programado) con dispositivos en el puerto Control Subnet → ese puerto **no da PoE**, así que hace falta un switch PoE (CEN-SW-POE-5 o CEN-SWPOE-16). | Es un error típico al cotizar. | bloquea |

Fuentes y citas:
- PROC-01: https://www.crestron.com/Products/Catalog/Control-and-Management/Control-System/Residential/MC4-R. Cita: *"Provides a built-in gateway for pairing infiNET EX® and ER wireless devices."* CP4-R: https://www.crestron.com/Products/Catalog/Control-and-Management/Control-System/Residential/CP4-R. Cita: *"Supports infiNET EX® network wireless devices via an optional external wireless gateway"*. DIN-AP4-R: https://www.crestron.com/Products/Catalog/Control-and-Management/Control-System/Residential/DIN-AP4-R. Cita: *"Supports infiNET EX® and SG network wireless devices via an external wireless gateway (sold separately)"*.
- PROC-02: MC4-R (misma URL). Cita: *"Available Cresnet Power 2.5 W"*. Horizon 2: https://www.crestron.com/Products/Catalog/Control-and-Management/Keypads/Horizon/HZ2-KPCN-W. Cita: *"Cresnet Power Usage 2 W (83 mA @ 24VDC)"*. Cameo 2: https://www.crestron.com/Products/Catalog/Control-and-Management/Keypads/Cameo-Keypad/CM2-KPCN-W-S (2 W).
- PROC-03: CP4-R (misma URL). Cita: *"Available Cresnet Power 24 W (1A @ 24VDC) when powered by the included power pack"*.
- PROC-04: MC4-R. Cita: *"Ethernet speed is limited to 100 Mbps when using the PWE-4803RU."*
- PROC-05: https://www.crestron.com/Products/Catalog/Control-and-Management/Control-System/Rack-Mount/CP4N. Cita: *"NOTE: The Control Subnet port does not supply any PoE power to connected devices"*.

### 1.3 Crestron programado (4-Series: CP4N / CP4 / MC4 / DIN-AP4 sin "-R")

| id | Regla | Por qué | Severidad |
|---|---|---|---|
| PRG-01 `programado-requiere-programacion` | Procesador 4-Series sin sufijo "-R" → el sistema requiere programación a medida (SIMPL Windows o C#), así que hay que cotizar horas de programación y de diseño de interfaz. | No trae sistema operativo "listo" como Crestron Home. **Convención de integrador (sin fuente oficial textual):** el catálogo describe la "modular programming architecture" pero no dice "requiere programación" con esas palabras. | advierte |
| PRG-02 `cp4n-programas` | CP4N → corre hasta 10 programas en paralelo. Sirve para separar funciones (AV, iluminación, HVAC) en programas distintos. | Capacidad documentada. | sugiere |
| PRG-03 `programado-bacnet-licencia` | Sistema programado con más de 50 objetos BACnet → hay que sumar la licencia SW-3SERIES-BACNET-50+. El CP4N tiene un máximo de 1000 objetos. | En el programado la licencia **no** viene incluida, al revés que en Crestron Home. | bloquea |
| PRG-04 `cp4r-exclusivo-home` | Los procesadores "-R" están diseñados exclusivamente para Crestron Home → si el proyecto es programado, no se usa un "-R". | Línea de producto. | bloquea |

Fuentes y citas:
- PRG-02 / PRG-03: CP4N (URL de PROC-05). Citas: *"allows the CP4N to run up to ten programs simultaneously"* y *"Enabling support for more than 50 BACnet objects requires the purchase of one SW-3SERIES-BACNET-50+ license."*
- PRG-04: CP4-R. Cita: *"It is designed exclusively to function as the core of a Crestron Home system"*.

### 1.4 infiNET EX, ER y SG: gateways y expansores

| id | Regla | Por qué | Severidad |
|---|---|---|---|
| RF-01 `gateway-modelo-vigente` | Gateway inalámbrico nuevo → CEN-GW1 o CENI-GW1 (internacional). CEN-GWEXER figura como discontinuado; CENI-GWEXER sigue en el catálogo. | Usar modelos vigentes. | advierte |
| RF-02 `gateway-capacidad` | Por gateway: hasta 100 dispositivos infiNET EX (sin ER), con un máximo de 5 expansores y 50 dispositivos SG. Cada dispositivo ER resta 10 EX. **Buena práctica: no superar el 50 % del máximo.** | Diseñar al 50 % (por ejemplo, 50 EX por gateway). | advierte |
| RF-03 `gateway-cantidad-sistema` | Cantidad de gateways → el CEN-GW1 admite hasta 16 por sistema. En Crestron Home el tope es 15 gateways inalámbricos externos (14 con MC4-R). | Límite del sistema. | bloquea |
| RF-04 `rf-saltos` | Malla infiNET EX → máximo 6 saltos, recomendado 3. | Confiabilidad. | advierte |
| RF-05 `rf-bateria-no-repite` | Los dispositivos a batería (teclados de mesa, sensores) son nodos hoja: no repiten la señal. Un ambiente que solo tiene dispositivos a batería y está lejos del gateway → agregar un expansor (CLW-EXPEX) o un dispositivo alimentado por red. | Si no, queda sin cobertura. | advierte |
| RF-06 `rf-alcance` | Alcance infiNET EX → unos 46 m (150 ft) en interior entre dispositivos EX. ER → 31 a 61 m. SG → 70 m en interior. | Sirve para dimensionar cobertura y expansores. | sugiere |
| RF-07 `expansor-solo-ex` | Los expansores CLW-EXPEX solo mejoran infiNET EX → no ayudan a dispositivos ER ni SG. | Error común de diseño. | advierte |
| RF-08 `expansor-tension` | El CLW-EXPEX se enchufa en un tomacorriente de 120 V AC (EE. UU.). En Argentina (230 V) → verificar que exista una versión internacional antes de cotizarlo. **No confirmé** el modelo 230 V. | Tensión de red. | advierte |

Fuentes y citas:
- RF-01: el buscador del catálogo devuelve https://www.crestron.com/Products/Catalog/Inactive/Discontinued/C/CEN-GWEXER (discontinuado) y https://www.crestron.com/Products/Catalog/Control-and-Management/Wireless-Communications/Gateway/CEN-GW1 (vigente).
- RF-02 / RF-03 / RF-06 / RF-07: CEN-GW1 (misma URL). Citas: *"To maintain optimal performance, use no more than 50% of the maximum devices allowed per gateway."*, *"Up to 16 gateways can be used in a system"*, *"A maximum of five infiNET EX expanders may be deployed on an infiNET EX network."* y *"infiNET EX expanders… offer no benefit to the performance of ER and SG devices."* Tabla de dispositivos máximos: 100 EX / 5 expansores / 0 ER / 50 SG … 0 EX / 5 / 10 ER / 50 SG. CENI-GWEXER: https://www.crestron.com/Products/Catalog/Control-and-Management/Wireless-Communications/Gateway/CENI-GWEXER. Cita: *"Each ER device that is added to the network negates ten EX devices, with a maximum of ten ER devices allowed."*
- RF-04 / RF-05: MC4-R. Cita: *"A maximum of six "hops" across routing nodes is allowed, although a maximum of three is recommended. Battery-powered infiNET EX devices only operate as leaf nodes"*. Ahí también: *"Up to 100 infiNET EX devices are permitted, although best practices suggest a limit of 50."* Guía de referencia (no leída): "Installation and Setup of Crestron RF Products Best Practice Guide (Doc. 6689)".
- RF-08: https://www.crestron.com/Products/Catalog/Control-and-Management/Wireless-Communications/Gateway/CLW-EXPEX-GD-W-T. Cita: *"Plugs into a standard 3-prong 120V AC receptacle"*.

### 1.5 Teclados (Horizon / Cameo) y tensión de red en Argentina

| id | Regla | Por qué | Severidad |
|---|---|---|---|
| KP-01 `teclado-tension-ar` | Proyecto en Argentina (230 V, 50 Hz) con teclados o dimmers alimentados de red → usar versiones 100-240 V o 230 V: CM2-KPEX (100-240 V AC), INET-CBDEX-230-*, CLWI-KPLEX (230 V AC), C2NI-CB. Las versiones 120 V (HZ2-KPEX "120 VAC", INET-CBDEX-E/P de 120 V) **no** se usan. | Tensión de red. | bloquea |
| KP-02 `horizon-caja-us` | Horizon 2 → hasta 4 equipos lado a lado en una caja multigang **de EE. UU.** con marco HZ2-FP-G. En obra argentina hay que prever cajas tipo US o pedir el accesorio de montaje correspondiente. **Convención de integrador:** el tema de la caja no está documentado para Argentina. | Montaje. | advierte |
| KP-03 `teclado-cresnet-vs-ex` | Teclado Cresnet (-KPCN) → necesita cable Cresnet de 4 conductores hasta el procesador o hub, y suma consumo al presupuesto Cresnet (ver PROC-02 y PROC-03). Teclado infiNET EX (-KPEX) → necesita gateway y cuenta en el cupo del gateway (RF-02). | Topología. | bloquea |
| KP-04 `teclado-modos-boton` | En Crestron Home cada botón tiene su propio modo (Scene, Quick Action, Lighting Load, Shade Room…). Un botón puede recorrer hasta 10 escenas o Quick Actions con pulsaciones múltiples. | Sirve para pensar el grabado y la cantidad de botones. | sugiere |
| KP-05 `dimmer-derating` | Varios dimmers en la misma caja multigang → aplicar la reducción de carga. Ejemplo: CLW-DIMEX-230 = 1000 VA solo, 800 VA en un lateral, 400 VA en el medio. | Seguridad y capacidad. | bloquea |

Fuentes y citas:
- KP-01: https://docs.crestron.com/en-us/8525/Content/CP4R/Appendix/Works-With-Crestron-Home/Keypads.htm. Cita: *"CM2-KPEX … infiNET EX® Wireless Communication, 100-240VAC"*, *"HZ2-KPEX - Horizon® 2 In-Wall Keypad … 120 VAC"* e *"INET-CBDEX-230-P - Cameo® Wireless Keypad, infiNET EX® Wireless, 230V"*.
- KP-02: HZ2-KPCN-W. Cita: *"Install up to four Horizon® 2 devices side-by-side in a US multigang electrical box with a compatible HZ2-FP-G series faceplate."*
- KP-04: https://docs.crestron.com/en-us/8525/Content/CP4R/Appendix/Keypad-Button-Modes.htm. Cita: *"Every button on a keypad can be assigned to a different button mode."* y *"Multiple button presses can recall up to 10 scenes"*.
- KP-05: https://docs.crestron.com/en-us/8525/Content/CP4R/Crestron-Home-Configurator/Load-Derating.htm. Cita: *"A load derating applies when multiple devices are installed in an electrical box."*

### 1.6 Cortinas Crestron

| id | Regla | Por qué | Severidad |
|---|---|---|---|
| SH-01 `cortina-fuente-10` | Motores QMT cableados → 1 CSA-PWS10S-HUB-ENET cada 10 motores (roller o drapery), con cableado home-run a cada motor. | Capacidad de la fuente. | bloquea |
| SH-02 `cortina-topologia-hubs` | Más de 10 motores → recomendado: 2 hubs en cadena por cada conexión Ethernet (≤ 20 motores). Máximo: 1 hub en modo Ethernet con hasta 6 hubs en cadena en modo Cresnet, 70 motores. | Rendimiento. | advierte |
| SH-03 `cortina-sdc-120v` | El C2N-SDC es para motores de 3 hilos **120 V AC** (EE. UU.). En Argentina → usar CLXI-1MC4 (230 V), CLCI-MCEX-W (230 V) o C2N-SDC-DC (motores de 24 V DC). | Tensión. | bloquea |
| SH-04 `cortina-limites-home` | Crestron Home → como máximo 100 cortinas por CP4-R (50 en MC4-R o DIN-AP4-R) y 200 en sistemas multiprocesador. Por ambiente, 50 escenas de cortina. | Límite del sistema. | bloquea |
| SH-05 `cortina-lutron-somfy` | Cortinas Somfy RTS/ST50 → interfaz CSC-ACEX. Cortinas Lutron → solo a través de un procesador Lutron soportado (HomeWorks QS/QSX, RA2 Select, RadioRA 2/3), y solo 1 procesador Lutron por sistema Crestron Home. | Integración. | bloquea |

Fuentes y citas:
- SH-01 / SH-02: https://www.crestron.com/Products/Catalog/Lighting-and-Environmental/Shades/Power-Supplies/CSA-PWS10S-HUB-ENET. Citas: *"Powers up to 10 Crestron® Quiet Motor Technology™ roller shade or drapery system motors"* y *"Two daisy-chained CSA-PWS10S-HUB-ENET modules per Ethernet connection with up to 20 connected motors is the recommended topology"*.
- SH-03: https://www.crestron.com/Products/Catalog/Lighting-and-Environmental/Shades/Controller/C2N-SDC. Cita: *"two independently controlled 120V AC outputs"*. Alternativas 230 V: https://docs.crestron.com/en-us/8525/Content/CP4R/Appendix/Works-With-Crestron-Home/Shading.htm (*"CLXI-1MC4 … International Version, 230V"*; *"CLCI-MCEX-W - Wireless Motor Controller, 230VAC"*).
- SH-04: Max-System-Size (ver §3).
- SH-05: Shading.htm (CSC-ACEX: *"infiNET EX® Wireless Interface to Somfy® ST50 ILT2 Motor"*). Límite de 1 procesador Lutron: Max-System-Size, fila "Lutron Processors 1".

### 1.7 Iluminación Zūm (comercial)

| id | Regla | Por qué | Severidad |
|---|---|---|---|
| ZUM-01 `zum-netbridge-por-sala` | Sala Zūm Mesh (inalámbrica) que se gestiona de forma centralizada o con la app → exactamente **1** ZUMMESH-NETBRIDGE por sala, montado sobre un ZUMMESH-JBOX o un JBOX-PSU. | Lo exige el fabricante. | bloquea |
| ZUM-02 `zum-mesh-32-por-sala` | Sala Zūm Mesh → como máximo 32 dispositivos inalámbricos; **cada grupo DALI cuenta como 1**. | Límite de la sala. | bloquea |
| ZUM-03 `zum-dali-64` | ZUMMESH-JBOX-DALI → hasta 64 drivers DALI y 15 grupos. Trae fuente DALI integrada (no hace falta fuente de bus externa). Para crear los grupos DALI necesita un NETBRIDGE. | Capacidad. | bloquea |
| ZUM-04 `zumnet-gateway-50` | ZUMNET-GATEWAY → hasta 50 NETBRIDGE (salas) por gateway, alcance de unos 31 m, máximo 6 saltos (recomendado 3). Gestiona un único ZUM-HUB4. | Capacidad. | bloquea |
| ZUM-05 `zum-hub4` | ZUM-HUB4 → hasta 1000 salas (con switch Ethernet), cadenas de hasta 20 equipos Zūm Net (cableado) y hasta 32 dispositivos Zūm Link por cadena dentro de la sala. Más de 9000 objetos BACnet predefinidos requieren SW-HUB4-PROG. | Capacidad. | bloquea |
| ZUM-06 `zum-alcance-mesh` | Zūm Mesh → unos 15 m (50 ft) entre dispositivos de la malla dentro de la sala. | Para ubicar los equipos. | advierte |

Fuentes y citas:
- ZUM-01: https://www.crestron.com/Products/Catalog/Lighting-and-Environmental/Zum-Wireless-Lighting/Control/ZUMMESH-NETBRIDGE. Cita: *"Note: Only one Network Bridge is permitted per room."*
- ZUM-02 / ZUM-03 / ZUM-06: https://www.crestron.com/Products/Catalog/Lighting-and-Environmental/Zum-Wireless-Lighting/Load-Controller/ZUMMESH-JBOX-DALI. Citas: *"A maximum of 32 Zūm Mesh wireless devices are permitted per room. Each DALI group counts as one of the 32"* y *"A ZUMMESH-NETBRIDGE must be connected to the ZUMMESH-JBOX-DALI for commissioning and control of DALI groups."*
- ZUM-04: https://www.crestron.com/Products/Catalog/Lighting-and-Environmental/Zum-Wireless-Lighting/Control/ZUMNET-GATEWAY. Cita: *"The Zūm Net gateway can support up to 50 Zūm Network Bridges."*
- ZUM-05: https://www.crestron.com/Products/Catalog/Lighting-and-Environmental/Zum-Wired-Lighting/Control/ZUM-HUB4. Cita: *"daisy-chain up to 20 Zūm Net devices… support up to 1,000 rooms"* y *"Daisy-chain up to 32 Zūm Link devices"*.

### 1.8 DM NAX (audio sobre IP, AES67)

| id | Regla | Por qué | Severidad |
|---|---|---|---|
| NAX-01 `nax-switch-requisitos` | Cualquier DM NAX → switch gestionado con: 1 Gbps por equipo, backplane non-blocking, IGMPv2 snooping, un IGMP querier (uno solo en la red) y fast-leave. QoS DSCP: recomendado, y **obligatorio** si conviven NAX y NVX. | El tráfico es multicast: sin esto la red se inunda. | bloquea |
| NAX-02 `nax-vlan-aislada` | NAX en la red del cliente → aislar en una VLAN o un switch dedicado. Los NAX no etiquetan VLAN: solo los modelos con 2 puertos permiten separar control y AoIP en el mismo switch. El puerto de control necesita Internet para el streaming. | Hay que separar el multicast de la red con Wi-Fi e Internet. | advierte |
| NAX-03 `nax-ptp` | Red NAX/AES67 → PTP alcanzable por todos los equipos. Conviene dejar la prioridad por defecto (254) para que un reloj dedicado, si existe, sea el líder. | Sincronismo. | advierte |
| NAX-04 `nax-multicast-direcciones` | Reservar direcciones multicast por cada stream de transmisión: un DM-NAX-8ZSA usa 24 (8 entradas + 8 media players + 8 Parallel Zone Outputs). Crestron Home las asigna solo. | Las direcciones duplicadas causan colisiones. | advierte |
| NAX-05 `nax-limite-home` | NAX con Crestron Home → hasta 32 dispositivos DM NAX y 256 zonas de salida según la hoja del NAX. **Pero** la tabla de tamaño de sistema de Crestron Home limita a 100 zonas de parlantes Crestron (CP4-R) y 56 (MC4-R, DIN-AP4-R). El motor debe usar el límite más bajo. Con SIMPL no hay tope fijo (depende de la red). | Las dos fuentes no coinciden. | bloquea |
| NAX-06 `nax-8zsa-zonas` | DM-NAX-8ZSA → 8 zonas estéreo amplificadas (16 canales): 150 W/canal a 8 Ω, 300 W a 4 Ω, 500 W en modo puente. Trae 4 salidas de línea que espejan las zonas 1 a 4, un reproductor de streaming por zona y hasta 4 buses por equipo. **No tiene salida 70 V/100 V** (solo publica cargas de 8 y 4 Ω). | Para asignar zonas. | bloquea (si el ambiente es 70 V) |
| NAX-07 `nax-4zsa50-zonas` | DM-NAX-4ZSA-50 → 4 zonas amplificadas + 1 de línea (5 zonas), 50 W/canal, medio rack 1U, con streaming por zona. | Para asignar zonas. | sugiere |
| NAX-08 `nax-70v-x300` | Ambiente con parlantes 70 V/100 V en un sistema NAX → DM-NAX-AMP-X300 en modo Hi-Z: 300 W totales, hasta 2 canales Hi-Z de 150 W o 1 de 300 W. También ofrece Dante nativo. | Es el único amplificador NAX con Hi-Z que encontré. | bloquea |
| NAX-09 `nax-voz-home` | Amazon Voice Service en el 8ZSA → solo funciona con Crestron Home. | Integración. | advierte |

Fuentes y citas:
- NAX-01 a NAX-04: https://docs.crestron.com/en-us/9045/Content/Topics/AoIP-Network-Design.htm. Citas: *"1 Gbps port for each connected DM NAX endpoint; Non-blocking backplane; Layer 3 IGMPv2 snooping; IGMPv2 Querier; Fast-Leave"*, *"This should be considered a hard requirement for any systems with mixed DM NAX and DM NVX traffic"*, *"DM NAX devices do not support VLAN tagging"* y *"the DM-NAX-8ZSA has … a total of 24 DM NAX transmit streams"*.
- NAX-05: https://docs.crestron.com/en-us/9045/Content/Topics/DM-NAX-AMP-X300/Features-X300.htm. Cita: *"A single DM NAX system with a Crestron Home OS processor can handle audio distribution between 32 DM NAX devices and supports up to 256 audio output zones."* Tabla de Crestron Home: Max-System-Size, fila "Crestron Speaker Zones 100 / 56 / 56".
- NAX-06 / NAX-09: https://www.crestron.com/Products/Catalog/AV-Over-IP/DM-NVX-AV-Over-IP/Amplifiers/DM-NAX-8ZSA. Citas: *"150 Watts/Ch. @ 8 Ohms or 300 Watts/Ch. @ 4 Ohms, with zones bridgeable up to 500 Watts/Ch."* y *"Amazon® Voice Service is currently only supported when using the DM-NAX-8ZSA with Crestron Home®."*
- NAX-07: https://www.crestron.com/Products/Catalog/AV-Over-IP/DM-NVX-AV-Over-IP/Amplifiers/DM-NAX-4ZSA-50. Cita: *"four amplified stereo speaker outputs and one analog line-level stereo output for a total of five zones."*
- NAX-08: Features-X300 (URL de NAX-05). Cita: *"Configurable for Lo-Z (4/8 Ω) or Hi-Z (70V or 100V) operation"*. Specs: https://docs.crestron.com/en-us/9045/Content/Topics/DM-NAX-AMP-X300/Specifications-X300.htm (*"Total output power from all channels combined (simultaneously) is up to 300 W."*).

### 1.9 Crestron AirMedia y Crestron Flex / Microsoft Teams Rooms

| id | Regla | Por qué | Severidad |
|---|---|---|---|
| AM-01 `airmedia-una-por-display` | Sala de reunión con presentación inalámbrica → 1 receptor AirMedia por display, montado detrás o al lado. Tiene salida HDMI hasta 4K y una entrada HDMI local de 1080p60. | Topología del producto. | sugiere |
| AM-02 `airmedia-limites` | AM-3200 → hasta 4 fuentes simultáneas (AirMedia Canvas). La presentación inalámbrica llega como máximo a 1080p30. La conferencia inalámbrica (BYOD con Teams o Zoom) funciona solo desde Windows 10/11 con la app de AirMedia. | Para fijar expectativas con el cliente. | advierte |
| AM-03 `airmedia-addons` | Control manual de la sala → sumar un touch TS/TSW-70 de 7" o 10". Encendido automático por ocupación → sensor CEN-ODT-C-POE. | Accesorios documentados. | sugiere |
| AM-04 `airmedia-stock` | El AM-3200 figura como "Limited Supply Available". Antes de cotizar → confirmar disponibilidad. **No pude confirmar** cuál es su sucesor. | Disponibilidad. | advierte |
| UC-01 `mtr-licencia` | Sala Microsoft Teams Rooms (kit Crestron Flex "-T") → hace falta **una licencia Teams Rooms por dispositivo**: Basic (USD 0, hasta 25 salas) o Pro (USD 40 por dispositivo por mes). La licencia no viene con el kit. | Costo recurrente que el cliente tiene que conocer. | bloquea |
| UC-02 `flex-displays` | Los kits Flex (por ejemplo UC-B70-A-T) admiten hasta 2 displays (que no vienen incluidos). Sala con 2 pantallas → verificar que el kit lo soporte. | Topología. | advierte |
| UC-03 `flex-modelos-vigentes` | UC-M50-T y UC-BX30-T figuran como discontinuados → para salas nuevas usar los modelos vigentes (por ejemplo UC-B70-A-T, UC-MM30-T, UC-BX31-T, UC-MX70-T). | Vigencia. | advierte |
| UC-04 `flex-int-version` | Proyecto fuera de EE. UU. y Canadá → pedir la versión "-I" (por ejemplo UC-B70-A-T-I). | El fabricante separa las versiones por región. | bloquea |

Fuentes y citas:
- AM-01 a AM-04: https://www.crestron.com/Products/Catalog/Presentation-and-Conferencing/AirMedia/Receiver/AM-3200. Citas: *"The Receiver mounts invisibly behind or beside a wall-mount display"*, *"Supports simultaneous display of up to four sources with AirMedia Canvas"*, *"AirMedia presentation: 1920x1080@30Hz (1080p30)"*, *"Windows 10, Windows 11 … Microsoft Teams software; Zoom software"* y *"Limited Supply Available"*.
- UC-01: https://www.crestron.com/Partners/Integrated-Partners/Microsoft/Microsoft-Licensing-Comparison. Citas: *"Microsoft Teams Rooms Basic license offers core meeting experiences for up to 25 meeting rooms"* y *"MTR Basic $0 per device per month MTR Pro $40 per device per month"*.
- UC-02 / UC-04: https://www.crestron.com/Products/Catalog/Unified-Communications/Flex-Conferencing/Room-Kits/UC-B70-A-T. Citas: *"supports up to two video displays (not included)"* y *"For International Version (except US and Canada): order UC-B70-A-T-I"*.
- UC-03: https://www.crestron.com/Products/Catalog/Unified-Communications/Flex-Conferencing/Room-Kits/UC-M50-T y https://www.crestron.com/Products/Catalog/Unified-Communications/Flex-Conferencing/Room-Kits/UC-BX30-T (ambas dicen "Discontinued"). Modelos vigentes: página de licencias, sección "Featured Microsoft Teams Rooms devices".

### 1.10 Sonance: amplificadores DSP, Sonamp y Blaze PowerZone

| id | Regla | Por qué | Severidad |
|---|---|---|---|
| SON-01 `sonance-dsp-a-blaze` | El fabricante está reemplazando los amplificadores Sonance DSP por Blaze PowerZone → para proyectos nuevos usar el equivalente: DSP 2-150 → PowerZone Connect 252 (o UA 2-125); DSP 8-130 → PZC 1008; DSP 2-750 → PZC 1502 o 2004 (70 V); James M-1000 → PZC 1502. Los Sonamp 8-50 y 16-50 siguen en producción. | Transición oficial de la línea. | advierte |
| SON-02 `blaze-uso-por-modelo` | Elegir el amplificador Blaze según el tipo de parlante: PZC 122/252/504 → parlantes Sonance VX, IS, SA (audio distribuido, TV). PZC 1008 → además Reference y James QX, y home theater. PZC 2U (1002 a 6008) → exteriores y subwoofers (SLS, AT, PPX, EMB). PowerZone 252/504/1004 (sin DSP) → 70 V y Professional Series. | Pareo oficial amplificador-parlante. | sugiere |
| SON-03 `blaze-70v` | Ambiente 70 V/100 V con Blaze → los canales trabajan en PowerShare o puenteados. La potencia en 70 V es la mitad de canales al doble de potencia (por ejemplo, PZC 504 = 4×125 W en baja impedancia o 2×250 W en 70 V/100 V). | Para dimensionar canales y potencia. | bloquea |
| SON-04 `blaze-sub-pareo` | Subwoofer Sonance o James → usar la tabla de pareo. Ejemplos: BPS8 → 1 canal de 150 W (PZC 252/504/1008). VXXT10RW → 2 canales en PowerShare de 300 W. R12 → PZC 1502, 1 canal de 400 W a 8 Ω. PPX10/12/15 o EMB → PZC 1002/2004/4008, 2 canales puenteados de 1000 W a 4 Ω. | Pareo oficial. | advierte |
| SON-05 `blaze-dante` | Hace falta Dante (para mandar el audio de la TV al rack, compartir subwoofers entre amplificadores o enviar desde un procesador de surround) → elegir las variantes "D" (por ejemplo 504D, 1008D, PRO 1200.4D). | Solo las "D" tienen Dante. | bloquea |
| SON-06 `sonamp-puente-8ohm` | Sonamp 12-50 o 2-100 en modo puente → carga mínima de 8 Ω. El 12-50 entrega 50 W por canal a 8 y 4 Ω (12 canales exigidos) y 100 W puenteado a 8 Ω. Acepta 220-240 V a 50 Hz. | Protección del amplificador. | bloquea |
| SON-07 `sonance-sgs-sistema` | Sonance Garden Series (SGS) → el sistema 8.1 funciona con un único DSP 2-150 MKIII de 2 canales (sistema adaptado a 8 Ω). Se puede ampliar a 16.2. Cubre hasta unos 325 m² (3500 ft²). Patio 4.1 con Sonamp 2-100 → unos 93 m² (1000 ft²). | Configuración cerrada del fabricante. | sugiere |

Fuentes y citas:
- SON-01 a SON-05: Blaze by Sonance Amplifiers Design Guide, https://images.salsify.com/images/daboibqxv2btnbrxsof2/training_Blaze_by_Sonance_Design_Guide.pdf (enlazada desde https://www.sonance.com/products/lbx-888-003). Citas: *"As we transition from the current Sonance DSP Amplifier line to the Blaze by Sonance PowerZone Series"*, *"Note that the 8-50 and 16-50 digital amplifiers will remain in production"*, *"PowerZone Connect 504/504D 4x125W 2x250W"* y *"PowerZone 252, 504 Non-DSP Distributed Audio, 70V Applications"*. Dante: https://www.sonance.com/products/ubx-888-029. Cita: *"500 W DSP-enabled Class-D amplifier with 4 channels and Dante"*.
- SON-06: https://images.salsify.com/images/kkimlirebpz6p2mrnmsp/12-50_DigitalAmp_SONANCE_Data_Sheet.pdf. Cita: *"50 watts (12 channels driven) … 100 watts [bridged @ 8 Ohms] … 220-240V@50Hz"*. Manual: https://images.salsify.com/images/zr67l4zgkzwxfxwde95g/Sonamp_2-100_12-50_SONANCE_Amplifier_93091_93092_manual_5122017.pdf (serigrafía del panel: *"BRIDGE 8 Ω MIN"*).
- SON-07: https://images.salsify.com/images/hhglmsro0in98sw1tclg/SGS_DSP_2-150_MKIII_Data_Sheet_2024.pdf. Cita: *"Complete 8.1 System configuration on a single two-channel amplifier. Expandable for up to 16.2 configuration"*. Patio: https://www.sonance.com/products/93553 (*"Designed to cover up to 1,000 square feet"*).

### 1.11 SoundTube: IPD (Dante/AES67 PoE) y 70 V

| id | Regla | Por qué | Severidad |
|---|---|---|---|
| ST-01 `ipd-poe-switch` | Parlante IPD (Dante/AES67) → necesita un puerto de switch PoE o PoE+ por parlante (o el STNET-SWITCH-II de 16 puertos, 40 W PoE), o una fuente de 24 V DC. Los IPD de superficie con amplificador de 40 W requieren PoE+ de 40 W. | Alimentación y audio van por el mismo cable de red. | bloquea |
| ST-02 `ipd-zonificacion-software` | IPD → la zonificación y la configuración se hacen por software (Dante Controller o similar). En la red hay que aplicar los mismos cuidados de multicast/PTP que con NAX (ver NAX-01 y NAX-03). **Convención de integrador:** aplicar reglas de red Dante/AES67. | Es AoIP. | advierte |
| ST-03 `ipd4-esclavos` | IPD4-CM52 o IPD4-CM62 → alimentan hasta 3 parlantes pasivos estándar (CM52-BGM o CM62-BGM). El grupo de 4 puede dividirse en 2 canales. | Kit económico de expansión. | bloquea (si se cuelgan más de 3) |
| ST-04 `ipd-hub2` | IPD-HUB 2 → amplificador DSP Dante pensado como alternativa IP a 70 V/100 V en salas chicas o medianas: 12 W por canal con PoE de 40 W. | Para dimensionar. | advierte |
| ST-05 `soundtube-70v-taps` | Parlantes pasivos SoundTube CM-BGM-II → selector de tap 25/70,7/100 V o bypass (16 Ω). En 70 V: la suma de taps no puede superar la potencia del canal del amplificador Hi-Z. En bypass, 16 Ω, que se cuentan en la carga de impedancia. **Convención de integrador:** usar como máximo el 80 % de la potencia del canal en 70 V. | Que el amplificador no recorte. | bloquea (si la suma de taps supera el canal) |
| ST-06 `soundtube-exterior` | Parlante IPD de superficie en exterior → IP65 solo con el tapón del port puesto. | Lo indica el fabricante. | advierte |
| ST-07 `soundtube-diseno` | Ambiente comercial distribuido → usar la calculadora SPEC 4.0 (cantidad, separación y potencia). Es una guía, no tiene en cuenta la acústica de la sala. | Recomendación del fabricante. | sugiere |

Fuentes y citas (API pública de catálogo https://www.soundtube.com/api/items y fichas):
- ST-01: https://www.soundtube.com/ipd-cm62-bgm-ii-wh. Cita: *"connection is made on the other end to the STNet-Switch or other PoE / PoE+ switch. May also be powered via a 24V DC barrel connector"*. https://www.soundtube.com/ipd-sm82-ez-ii-wx-wh. Cita: *"This speaker includes a 40 W PoE amplifier"*. https://www.soundtube.com/stnet-switch-ii. Cita: *"16-Port 40W PoE Rack Mountable Dante Audio Switch"*.
- ST-02: IPD-CM62. Cita: *"Configuration and zoning of the speaker are accomplished via software."*
- ST-03: https://www.soundtube.com/ipd4-cm62-bgm-ii-wh. Cita: *"output terminals for connection and power of up to three additional standard CM62-BGM speakers"*.
- ST-04: https://www.soundtube.com/ipd-hub-2. Cita: *"an IP-based alternative to traditional 70V/100V distributed audio systems… Output power with 40 W PoE is 12 W per channel."*
- ST-05: https://www.soundtube.com/cm62-bgm-ii-wh. Cita: *"six-position tap switch for 25/70.7/100-volt and transformer bypass settings … 16 ohm impedance"*.
- ST-06: IPD-SM82-EZ-II-WX. Cita: *"Port must remain plugged to maintain IP65 rating in outdoor use."*
- ST-07: https://www.soundtube.com/configuration-tools. Cita: *"provides baseline estimates for speaker quantity and spacing, coverage area per speaker, and overall system power requirements."*

### 1.12 Reglas eléctricas generales de audio (convención de integrador)

| id | Regla | Severidad |
|---|---|---|
| AUD-01 `impedancia-paralelo` | Parlantes en paralelo sobre un canal de baja impedancia → la impedancia resultante (Z/n con parlantes iguales) no puede quedar por debajo del mínimo del amplificador. Ejemplo: 2 parlantes de 8 Ω = 4 Ω, aceptable solo si el amplificador declara 4 Ω. **Convención de integrador (sin fuente oficial).** Los mínimos sí están documentados: 8 Ω en puente en el Sonamp; 4/8 Ω en NAX X300; 8 y 4 Ω en NAX 8ZSA. | bloquea |
| AUD-02 `no-mezclar-hiz-loz` | No mezclar parlantes en 70 V y en baja impedancia sobre el mismo canal. **Convención de integrador.** | bloquea |
| AUD-03 `potencia-parlante` | Potencia del canal entre 1× y 2× la potencia RMS del parlante. **Convención de integrador.** | sugiere |
| AUD-04 `zona-estereo-vs-mono` | Ambientes chicos o de techo con un solo punto de escucha → parlante estéreo de punto único (Sonance "DT"/"single-point stereo") o zona mono. **Convención de integrador.** Que existe el modelo de punto único está confirmado en la lista de audio de Crestron Home (*"ASPIRE IC6DT … Single-Point Stereo In-Ceiling Speaker"*). | sugiere |

---

## 2. Reglas por tipo de ambiente

Salvo donde se indica una fuente, todo esto es **convención de integrador (sin fuente oficial)**. Los límites por ambiente que sí documenta Crestron Home están marcados.

### 2.1 Reglas transversales (cualquier ambiente)

| id | Regla | Fuente |
|---|---|---|
| AMB-01 `teclado-por-acceso` | Cada puerta de acceso a un ambiente con iluminación controlada → 1 teclado o dimmer del lado de la apertura de la puerta, a unos 1,10-1,20 m del piso. Si el ambiente tiene 2 o más accesos → un teclado en cada uno (multiway, por ejemplo HZ2-AUX). | Convención de integrador. Que el multiway existe: Keypads.htm (*"HZ2-AUX - Horizon® 2 In-Wall Multiway Remote"*). |
| AMB-02 `escenas-por-ambiente` | Por ambiente, Crestron Home permite como máximo 50 escenas de luz, 50 de cortinas, 200 de media y 50 Quick Actions (la app muestra 20). | Oficial: Max-System-Size, *"Room-Level Limits … Lighting Scenes 50 Shade Scenes 50 Media Scenes 200"*. |
| AMB-03 `remotos-por-ambiente` | Controles remotos HR por ambiente: como máximo 2 con CP4-R y 1 con MC4-R o DIN-AP4-R. | Oficial: Max-System-Size, *"Remotes per Room 2 / 1 / 1"*. |
| AMB-04 `displays-por-ambiente` | Displays por ambiente en Crestron Home: como máximo 7. | Oficial: Max-System-Size, *"Displays in a Room 7"*. |
| AMB-05 `teclado-cortinas` | Ambiente con cortinas motorizadas → un botón Abrir/Cerrar (modo "Shade Room") en el teclado de acceso. Si hay 2 o más paños, se agrupan con Shade Groups. | Convención de integrador. El modo existe: Keypad-Button-Modes.htm (*"the Shade Room button mode supports Tap and Press and Hold"*). |
| AMB-06 `audio-por-zona` | Ambiente con audio distribuido → una zona de amplificador (estéreo, o mono si es chico) y un control local: teclado con volumen y fuente, touch o app. Cada zona cuenta en el límite de "Crestron Speaker Zones". | Convención de integrador para el control local; límite oficial (Max-System-Size). |
| AMB-07 `termostato-por-zona-hvac` | Un termostato por zona HVAC independiente (no por ambiente). Para fan-coil → modelos -FCU. | Convención de integrador. Que existen modelos FCU: Climate-Control.htm (*"CHV-TSTAT-FCU - Heating/Cooling Fan-Coil Thermostat"*). |

### 2.2 Por tipo de ambiente

| Ambiente | Reglas sugeridas | Fuente |
|---|---|---|
| **Dormitorio principal** | Teclado en el acceso (Encender/Apagar/Escena/Cortinas). **Teclado a cada lado de la cama** (Apagar todo/Noche/Cortinas/Lectura). Cortinas blackout motorizadas. Zona de audio propia. Termostato si la zona HVAC es independiente. Iluminación de cortesía o de circulación nocturna. | Convención de integrador. |
| **Dormitorio secundario** | Teclado en el acceso. Junto a la cama, opcional. Cortinas. Audio opcional. | Convención de integrador. |
| **Living / estar** | Teclado de 4 a 6 botones en cada acceso (escenas Bienvenida/Cine/Leer/Apagar + cortinas). Touch screen o remoto si hay TV (≤ 2 remotos por ambiente con CP4-R). Zona de audio, normalmente estéreo. Cortinas agrupadas. | Convención de integrador + AMB-03. |
| **Home theater / media room** | Remoto o TSR-310 como interfaz principal. Teclado en el acceso con escenas Película/Intervalo/Luces. Cortinas blackout. Amplificación multicanal o AVR (Crestron Home: hasta 24 AVR con CP4-R). Subwoofer pareado según SON-04. | Convención de integrador + Max-System-Size + guía Blaze. |
| **Cocina** | Teclado en el acceso. Zona de audio (normalmente mono o de punto único). Iluminación en varios circuitos (general, mesada). | Convención de integrador. |
| **Baño** | Dimmer o switch en el acceso. Si hay audio → parlante para ambiente húmedo (por ejemplo "all weather"). Sensor de ocupación opcional. | Convención de integrador. |
| **Pasillos / circulación** | Sensor de ocupación o vacancia + escena nocturna. Teclado multiway en las puntas. | Convención de integrador. |
| **Exterior / jardín** | Audio: sistema cerrado Sonance SGS o Patio (SON-07), o Blaze 2U. Parlantes IP65 si son IPD. Iluminación por escenas y horario. | Oficial (SON-07, ST-06) + convención. |
| **Sala de reuniones (Teams)** | Kit Crestron Flex -T con su versión -I fuera de EE. UU. Licencia MTR por sala (UC-01). Opcional: AirMedia por display. Teclado o touch para luces y cortinas. Sensor de ocupación PoE. | Oficial (UC-01 a UC-04, AM-03) + convención. |
| **Huddle / sala chica** | AirMedia (1 por display) o kit Flex chico (UC-MM30-T / UC-BX31-T). | Oficial (página de licencias MTR, "Featured devices"). |
| **Comercial (oficina abierta, aula)** | Zūm: 1 NETBRIDGE por sala, ≤ 32 dispositivos Mesh por sala, sensores de ocupación y daylight. Audio 70 V (X300 Hi-Z, Blaze PowerZone sin DSP, SoundTube con taps) o IPD Dante. | Oficial (ZUM-01/02, NAX-08, SON-02, ST-05). |
| **Hotel – habitación** | Teclado en el acceso + junto a la cama + baño. Card switch / ocupación. Cortinas. | Convención de integrador. |

---

## 3. Límites numéricos útiles

### 3.1 Crestron Home: capacidades por procesador (valores **recomendados**, no máximos absolutos)
Fuente: https://docs.crestron.com/en-us/8525/Content/CP4R/Design/System-Design-Max-System-Size.htm. Cita: *"The values provided are intended as recommendations and not an absolute maximum system size."*

| Tipo | CP4-R | DIN-AP4-R | MC4-R | Multiprocesador (CP4-R padre) |
|---|---|---|---|---|
| Procesadores hijos | 10 | 10 | 10 | 10 |
| Touch screens / TSR-310 | 24 | 12 | 12 | 40 |
| Remotos HR | 24 | 16 | 16 | 24 |
| Remotos por ambiente | 2 | 1 | 1 | 2 |
| Teclados | 120 | 60 | 60 | 240 |
| Fuentes de audio | 24 | 24 | 24 | 48 |
| Zonas de parlantes Crestron | 100 | 56 | 56 | 100 |
| Grupos de audio activos | 4 | 4 | 4 | 4 |
| Ambientes por grupo de audio | 20 | 10 | 10 | 20 |
| Zonas o players Sonos | 16 | 8 | 8 | 16 |
| Fuentes de video | 32 | 16 | 16 | 54 |
| Zonas de video | 32 | 16 | 16 | 40 |
| Displays por ambiente | 7 | 7 | 7 | 7 |
| Receptores AV | 24 | 12 | 12 | 24 |
| Apple TV con HomeKit | 25 | 25 | 15 | 25 |
| Gateways inalámbricos externos | 15 | 15 | 14 | 15 |
| Gateways cableados externos | 14 | 14 | 14 | 14 |
| Gateways DMX-C | 3 | 3 | 3 | 3 |
| Gateways DALI | 15 | 15 | 15 | 15 |
| Bridges Philips Hue | 1 | 1 | 1 (MC4-R v2 o posterior) | 1 |
| Procesadores Lutron | 1 | 1 | 1 | 1 |
| Cortinas y drapes | 100 | 50 | 50 | 200 |
| Cargas de iluminación (total) | 500 | 300 | 200 | 1000 |
| Luces DMX-C | 255 | 255 | 255 | 600 |
| Termostatos | 100 | 100 | 50 | 100 |
| Objetos BACnet | 2000 | 500 | 500 | 2000 |
| Sistemas de seguridad | 3 | 3 | 3 | 3 |
| Cerraduras | 16 | 16 | 16 | 16 |
| Cámaras de streaming | 100 | 50 | 50 | 100 |
| Sensores | 32 | 16 | 16 | 32 |
| Ambientes | 100 | 100 | 100 | 100 |

Límites de toda la casa: 50 Quick Actions (la app muestra 20) y 150 escenas de clima. Por ambiente: ver AMB-02.
Procesadores discontinuados (CP4-R V1, MC4-R V1, PC4-R): hasta 4 hijos y límites menores (por ejemplo, MC4-R V1: 100 cargas de luz y 12 termostatos). Ver la misma página.

### 3.2 RF y buses

| Concepto | Valor | Fuente |
|---|---|---|
| Dispositivos infiNET EX por gateway (máximo / recomendado) | 100 / 50 | CEN-GW1, MC4-R |
| Expansores infiNET EX por red | 5 | CEN-GW1, CLW-EXPEX |
| Dispositivos ER por gateway | 10 (cada uno resta 10 EX) | CENI-GWEXER |
| Dispositivos SG por gateway | 50 | CEN-GW1 |
| Gateways por sistema (CEN-GW1) | 16 | CEN-GW1 |
| Gateways externos en un MC4-R | 15 (CEN-GWEXER) | MC4-R |
| Saltos en la malla (máximo / recomendado) | 6 / 3 | MC4-R, ZUMNET-GATEWAY |
| MLX-3 por gateway | 6 | CEN-GW1 |
| Alcance infiNET EX en interior / exterior | 46 m / 76 m | CEN-GW1 |
| Alcance ER en interior / exterior | 31-61 m / 305 m | CEN-GW1 |
| Alcance SG en interior / exterior | 70 m / 200 m | CEN-GW1 |
| ER: roaming entre gateways | hasta 8 | CEN-GW1 |
| Potencia Cresnet disponible: CP4-R / MC4-R | 24 W / 2,5 W | CP4-R, MC4-R |
| Consumo Cresnet de un teclado HZ2-KPCN o CM2-KPCN | 2 W | HZ2-KPCN-W, CM2-KPCN-W-S |
| Motores QMT por CSA-PWS10S-HUB-ENET | 10 | CSA-PWS10S-HUB-ENET |
| Hubs de cortina por Ethernet (recomendado / máximo) | 2 hubs, 20 motores / 1+6 hubs, 70 motores | CSA-PWS10S-HUB-ENET |
| Horizon 2 por caja multigang (US) | 4 | HZ2-KPCN-W |

### 3.3 Zūm

| Concepto | Valor | Fuente |
|---|---|---|
| NETBRIDGE por sala | 1 | ZUMMESH-NETBRIDGE |
| Dispositivos Zūm Mesh por sala (cada grupo DALI cuenta 1) | 32 | ZUMMESH-JBOX-DALI |
| Drivers DALI / grupos por ZUMMESH-JBOX-DALI | 64 / 15 | ZUMMESH-JBOX-DALI |
| NETBRIDGE (salas) por ZUMNET-GATEWAY | 50 | ZUMNET-GATEWAY |
| Alcance Zūm Net / Zūm Mesh | 31 m / 15 m | ZUMNET-GATEWAY / ZUMMESH-JBOX-DALI |
| Salas por ZUM-HUB4 | 1000 | ZUM-HUB4 |
| Equipos Zūm Net en cadena | 20 | ZUM-HUB4 |
| Equipos Zūm Link en cadena | 32 | ZUM-HUB4 |
| Objetos BACnet preset del ZUM-HUB4 | 9000 | ZUM-HUB4 |

### 3.4 Audio

| Concepto | Valor | Fuente |
|---|---|---|
| DM-NAX-8ZSA: zonas / potencia | 8 estéreo; 150 W a 8 Ω, 300 W a 4 Ω, 500 W en puente | DM-NAX-8ZSA |
| DM-NAX-8ZSA: streams multicast | 24 | AoIP-Network-Design |
| DM-NAX-8ZSA: buses | 4 (hasta 8 zonas por bus) | DM-NAX-8ZSA |
| DM-NAX-4ZSA-50: zonas | 4 amplificadas + 1 de línea, 50 W | DM-NAX-4ZSA-50 |
| DM-NAX-AMP-X300 | 4×75 W, 2×150 W o 1×300 W; Hi-Z 70/100 V: 300 W totales | Features-X300 / Specs-X300 |
| NAX con Crestron Home (hoja del NAX) | 32 equipos / 256 zonas (pero ver NAX-05) | Features-X300 |
| Puerto de switch por equipo NAX | 1 Gbps | AoIP-Network-Design |
| Sonamp 12-50 | 12 canales × 50 W (a 8 y 4 Ω); 100 W en puente a 8 Ω (mínimo 8 Ω en puente) | Datasheet 12-50 y manual |
| Blaze PZC 1U | 122: 2×60 / 1×125 · 252: 2×125 / 1×250 · 254: 4×60 / 2×125 · 504: 4×125 / 2×250 · 508: 8×60 / 4×125 · 1008: 8×125 / 4×250 (baja impedancia / 70-100 V-PowerShare) | Blaze Design Guide |
| Blaze PZC 2U | 1002: 2×250 (8 Ω), 2×500 (4/2 Ω), 1×1000 · 1502: 2×400 / 2×750 / 1×1200-1500 · 2004: 4×250 / 4×500 / 2×1000 · 3004: 4×400 / 4×750 / 2×1200-1500 · 4008: 8×250 / 8×500 / 4×1000 · 6008: 8×400 / 8×750 / 4×1200-1500 | Blaze Design Guide |
| Blaze PowerZone (sin DSP) | 252: 2×150 / 2×125 · 504: 2×250 / 2×250 · 1004: 4×250 / 4×250 (baja impedancia / 70 V) | Blaze Design Guide |
| SGS 8.1 | 8 satélites + 1 subwoofer en 1 DSP 2-150 MKIII; ampliable a 16.2; unos 325 m² | SGS datasheet |
| SoundTube IPD4 | 1 parlante activo + hasta 3 pasivos | IPD4-CM62 |
| SoundTube IPD-HUB 2 | 12 W por canal con PoE de 40 W | IPD-HUB 2 |
| SoundTube CM-BGM-II | taps 25/70,7/100 V o bypass de 16 Ω | CM62-BGM-II |

### 3.5 Presentación y UC

| Concepto | Valor | Fuente |
|---|---|---|
| AM-3200: fuentes simultáneas | 4 | AM-3200 |
| AM-3200: resolución AirMedia / HDMI de entrada | 1080p30 / 1080p60 (salida hasta 4K) | AM-3200 |
| Licencia MTR Basic / Pro | USD 0 (hasta 25 salas) / USD 40 por dispositivo por mes | Microsoft-Licensing-Comparison |
| Displays por kit Flex B70 | hasta 2 | UC-B70-A-T |

---

## 4. Discrepancias y pendientes detectados

1. **Cantidad de procesadores hijos en Crestron Home:** 10 según Max-System-Size y 4 según Pair-Multiple-Processors. Lo más probable es que 4 aplique a los procesadores V1 o a firmware viejo. Habría que confirmarlo con homedesign@crestron.com (contacto oficial: https://docs.crestron.com/en-us/8525/Content/CP4R/Overview/Overview-Design-Support.htm).
2. **Zonas NAX en Crestron Home:** 256 según la hoja del NAX y 100 según la tabla de Crestron Home. El motor usa la tabla, que es más conservadora.
3. **Procesador "PRO4-R":** no existe. PRO4 está discontinuado y es un procesador programado.
4. **AM-3200:** "Limited Supply"; no encontré cuál es el sucesor.
5. **CLW-EXPEX y dimmers o teclados Horizon:** son modelos de 120 V y caja US. Para Argentina hay que verificar las versiones internacionales (las variantes 230 V que se listan son CLWI-*, INET-CBDEX-230-*, CM2-* de 100-240 V y CLXI-*).
6. **Guía de pareo Sonance para parlantes de techo y pared** (cuántos por canal): no hay documento oficial más allá de la tabla de subwoofers de Blaze y los usos por modelo. Se aplica AUD-01 como convención.
7. **Doc. 6689 "Installation and Setup of Crestron RF Products – Best Practices":** está citado por Crestron pero no lo leí (no ubiqué la URL directa). Puede traer reglas más finas de ubicación de gateways.
