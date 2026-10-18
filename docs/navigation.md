# Navigation model

## Decision

Lifts keeps the fixed four-tab model. There is no router or navigation library
(ARCH-09). The tabs are Workout, History, Exercises, and Progress; the active
workout logger is a full-screen overlay above the tabs, and every modal is an
overlay at the app root. There are no nested stacks.

## Why

- The product has exactly four top-level surfaces and no parameterised screens.
- Screens are mounted once and kept warm (PERF-11), so tab switching is instant;
  a router would need explicit handling to preserve that.
- The active logger must survive tab changes and minimize into the mini bar; an
  overlay owned by `App.tsx` does that without route state.
- Staying router-free keeps the web bundle small in an offline-first app.

## Behavior

| Platform | Behavior |
| --- | --- |
| Web | Tabs map to `#/workout`, `#/history`, `#/exercises`, and `#/analytics`. Loading a URL with a valid hash selects that tab; tab changes push a history entry; browser back/forward selects the tab in the URL; an empty hash is normalised with `replaceState` so back does not leave the app. |
| Android | Back from a secondary tab returns to Workout; back on Workout exits the app. The active logger's own back handler has precedence and minimizes the workout. |
| iOS | Tab switching is touch-only; the logger's back control minimizes it. |

## Extending

If a future flow needs nested screens or parameterised deep links (for example
`#/history/<workout-id>` or onboarding), replace `src/navigation/tabRoutes.ts`
and the two hooks with expo-router (or React Navigation), keeping the four tabs
as the top-level routes. The files in `src/navigation/` are the only place that
touch browser history or the Android back button.
