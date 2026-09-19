# Product Roadmap & Feature Milestones

This document tracks upcoming feature milestones for **Lifts**, prioritized based on user requirements and architectural readiness.

---

## Milestone 1: Exercise Library Two-Frame Animation & Form Gallery
**Focus:** Visual movement demonstration and technique guidance for all 876 bundled exercises.

### Objectives
- **Two-Frame Movement Loop:**
  - Leverage pinned Free Exercise DB photographs (`0.jpg` start position and `1.jpg` peak contraction/lockout) to deliver an interactive 2-frame exercise animation.
  - Auto-looping animation with smooth transition (1.0s – 1.2s cadence) inside [ExerciseDetailModal](file:///workspace/lifts/src/components/ExerciseDetailModal.tsx).
- **Interactive Controls:**
  - Play / Pause button and manual frame scrubber (Frame 1: Starting Setup ↔ Frame 2: Peak Contraction).
  - Fullscreen/hero visual view option in the detail modal for technique inspection.
- **Offline & Custom Resilience:**
  - Instant fallback to the deterministic generated silhouette when offline or if remote image loading fails.
  - Custom user exercises retain their custom link/visual defaults.

---

## Milestone 2: Expanded Analytics & Training Insights
**Focus:** Deeper training intelligence, recovery balance, and consistency visualization.

### Objectives
- **Muscle Volume Distribution:**
  - Interactive distribution charts showing working set volume by major muscle group (Chest, Back, Quads, Hamstrings, Shoulders, Arms, Core) over selectable timeframes (Weekly, Monthly, All-time).
  - Push/Pull and Upper/Lower balance indicators to highlight undertrained or overtrained muscle groups.
- **Weekly Workout Frequency & Consistency Heatmap:**
  - GitHub-style or calendar-style workout consistency heatmap showing training density and rest days.
  - Weekly streak counter and workout adherence metrics.
- **Strength Progression & 1RM Trendlines:**
  - Estimated 1RM and volume progression charts across workouts with PR milestone callouts.

---

## Milestone 3: Routine & Workout Template Enhancements
**Focus:** Advanced workout split planning, routine management, and template ergonomics.

### Objectives
- **Routine Folders & Split Scheduling:**
  - Group routines by folders (e.g. "Push / Pull / Legs", "Upper / Lower", "Strength Cycle").
  - Split scheduling allowing users to assign routines to specific days of the week.
- **Template Set Ergonomics:**
  - Preset target RPE and warmup protocols directly within routine templates.
  - Exercise-level form notes and equipment seat/pin adjustments carried forward automatically when starting a workout from a routine.
- **Quick Routine Reordering & Duplication:**
  - Fast routine cloning and 1-tap template reordering.
