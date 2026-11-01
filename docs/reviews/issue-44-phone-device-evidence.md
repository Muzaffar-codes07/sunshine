# Issue #44 real phone capability evidence

Observed on 1 November 2026 (Asia/Kolkata) using the development-only `/spike` page from commit `74c24296196bbc011b2fe5f89285951f2a938978`. The device-control and capability-page sources are unchanged between that commit and `main` at `3787c92`. This record separates what the attached screenshot shows from outcomes reported by the person operating the phone.

## Device and access

- Windows identified the connected handset as **OPPO A3 Pro 5G**. The phone page reported a mobile Chrome 156 user agent and five touch points. Its user agent contains `Android 10; K`, which is a browser string rather than a verified OS version.
- The phone loaded `/spike` over laptop Wi-Fi at `http://10.3.13.146:5173/spike`. The page reported **Secure context: no**, **getUserMedia: no**, **BarcodeDetector: no**, and no supported barcode formats. Tapping **Scan with camera** showed the page's secure-context refusal. No camera permission prompt or camera barcode result occurred on this URL.
- USB file transfer identified the phone in Windows, but `adb devices -l` listed no device. The phone user reported that wireless debugging was unavailable. The test therefore used the phone browser directly; no emulator or simulated media API was used for the observations below.

## Controls exercised on the phone

- **Manual barcode fallback:** the attached phone screenshot shows `TEST-44` in the scanned-code log with the **via manual** source badge. This is a real phone keyboard entry, not camera or hardware-scanner evidence.
- **Photo:** the user reported taking a JPEG with the phone camera through **Capture photo**. The page displayed a preview and `image/jpeg` metadata for `17934909480783390599568814216933.jpg` (3421.3 KB). The user then tapped **Remove photo** and confirmed the preview disappeared. The image itself was not retained in this repository.
- **Signature:** the phone page displayed an exported `image/png` signature preview of 8.5 KB. The user reported that **Clear signature** disabled **Export PNG** again. No signature image was retained in this repository.
- **Physical scanner:** none was available during this session. No USB or Bluetooth scanner pass is claimed.

The [phone screenshot](evidence/issue44-oppo-manual-scan.jpg) is the direct visual evidence for the manual-source result (SHA-256 `643800EFEA3F45C0F8EC681593953F98FEEED5FE757931992542EC27D17F8CF5`). Photo capture/removal and signature clear/export are user-reported phone observations supported by the copied page text, not by that screenshot.

## Acceptance remaining

This run establishes real-phone page access, touch, manual entry, photo preview/removal and signature export/clear. It does **not** establish camera barcode scanning or physical-scanner input. Issue #44's F02/F08P hardware gate must remain open until the chosen demo phone reaches the page through a trusted secure context and a physical scanner is tested, or the limitations are explicitly accepted for the demo. The [device runbook](../planning/demo-runbook.md) describes the secure-context setup choices.
