# Installing Lifts on iOS for free with SideStore

This is a **native** iPhone build, not a PWA or an Expo Go session. The
repository builds an **unsigned** IPA on a GitHub-hosted macOS runner; each
tester signs and installs that IPA using SideStore and their own **free Apple
Account**. No Mac or paid Apple Developer Program membership is needed from
the Lifts maintainer.

## Build the IPA

1. After this workflow is merged into `develop`, open
   [Build iOS IPA (SideStore)](https://github.com/Benflex1/lifts/actions/workflows/build-ios-ipa.yml).
2. Choose **Run workflow**, select the intended branch, and run it. Pull
   requests targeting `develop` that change iOS build inputs also run the
   workflow for early validation.
3. When the job succeeds, open the run's **Artifacts** section and download
   `lifts-ios-unsigned-ipa`. Extract that downloaded ZIP to obtain
   `Lifts-unsigned.ipa` (the GitHub artifact ZIP is not itself an IPA).
4. Test the IPA on an actual iPhone before distributing it to friends.
   A green GitHub Actions build only verifies compilation and packaging, not
   installability, iOS runtime behavior, or Apple Health integration.

**Do not use `eas build --platform ios --profile preview` for this free
signing route:** EAS's normal internal distribution requires Apple developer
signing credentials. This workflow uses `expo prebuild`, CocoaPods, and
`xcodebuild` with code signing disabled.

## One-time setup on each iPhone

Follow the maintained [SideStore prerequisites](https://docs.sidestore.io/docs/installation/prerequisites)
and [installation instructions](https://docs.sidestore.io/docs/installation/install).

1. Have an iPhone running iOS 15 or later, a free Apple Account, Wi-Fi, and
   one-time access to a Windows, Linux, or macOS computer.
2. Install **LocalDevVPN** from the App Store. On Arch/CachyOS, install and
   start `usbmuxd` and download the official iloader **AppImage**; do not
   assume an AUR package has been audited by SideStore.
3. Connect the iPhone via USB, trust the computer, and use **iloader** to
   install the stable SideStore release with the tester's Apple Account.
4. Trust that account's developer app in
   **Settings > General > VPN & Device Management**. Enable
   **Settings > Privacy & Security > Developer Mode** if instructed.
5. Connect LocalDevVPN on Wi-Fi, open SideStore, sign in, and refresh
   SideStore itself once to complete setup.
6. Transfer `Lifts-unsigned.ipa` to the iPhone (e.g. Files or a direct HTTPS
   link), open **SideStore > My Apps > +**, and select the IPA.

Each friend signs with **their own** Apple Account. Do not share Apple
credentials or signing material.

## Keeping it working

- A free Apple signature expires after **seven days**. SideStore can attempt
  background refreshes, but they are not guaranteed. Keep its background
  refresh enabled and verify the expiry counter occasionally. For install,
  update, or refresh, LocalDevVPN must be connected, and Wi-Fi is required.
- Apple's free-account limits include up to **three sideloaded apps per
  device**, and SideStore itself counts toward that limit.
- Installing a new Lifts version over the existing app with the same
  signing account and bundle ID should normally retain its local SQLite
  database. **Export a Lifts backup before updating or reinstalling.**
  Never uninstall the app as a routine refresh mechanism.
- The app's configured **HealthKit integration** is included in the native
  build. Whether SideStore's free signing can successfully provision its
  HealthKit entitlement is **unverified**; test this separately on a device.
  Standard workout logging does not require granting Health access.
- GitHub Actions artifacts expire after 14 days. The maintainer must
  provide a durable HTTPS-hosted IPA or GitHub Release asset before sharing
  a convenient installation link with friends. A SideStore source/update
  feed can be added once the first device install is confirmed.

## Device acceptance checklist

- Install and launch the IPA without a development server.
- Complete a workout while offline; restart Lifts and verify history persists.
- Export a backup; install an updated IPA over Lifts; verify history persists.
- Refresh Lifts and SideStore before day seven without connecting to a PC.
- Independently test optional HealthKit export and report entitlement failures.

This is a sideloading preview workflow: the existing Android/F-Droid release
pipelines and Apple signing configuration remain unchanged.
