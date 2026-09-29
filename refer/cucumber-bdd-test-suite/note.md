| Selected Date Scenario                              | Hour Selection Menu (HRS)                                 | Minute Selection Menu (MIN)                                                                                                                                                 | Default / Auto-Correction Behavior                                                                                                                                                    |
| :-------------------------------------------------- | :-------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Date == minDate**<br>_(Absolute minimum day)_     | Restrained to:<br>≥ `minDate.hours`                       | • If Selected Hour == `minDate.hours`:<br>&nbsp;&nbsp;Restrained to ≥ `minDate.minutes`<br>• If Selected Hour > `minDate.hours`:<br>&nbsp;&nbsp;Full range (00–59)          | • **On date select:** Auto-set time to `minDate.hours : minDate.minutes`.<br>• If current time is earlier than `minDate` time, auto-bump hour and minute to match `minDate` minimums. |
| **Date == maxDate**<br>_(Absolute maximum day)_     | Restrained to:<br>≤ `maxDate.hours`                       | • If Selected Hour == `maxDate.hours`:<br>&nbsp;&nbsp;Restrained to ≤ `maxDate.minutes`<br>• If Selected Hour < `maxDate.hours`:<br>&nbsp;&nbsp;Full range (00–59)          | • **On date select:** Auto-set time to `00:00`.<br>• If current time is later than `maxDate` time, auto-adjust hour and minute down to match `maxDate` maximums.                      |
| **Normal Date**<br>_(`minDate` < Date < `maxDate`)_ | Full range allowed:<br>(00–23)                            | Full range allowed:<br>(00–59)                                                                                                                                              | • **On date select:** Auto-set time to `00:00`.<br>• No further changes to time selections unless switching from a previously constrained date.                                       |
| **Same Day Block**<br>_(`minDate` == `maxDate`)_    | Restrained to:<br>≥ `minDate.hours` AND ≤ `maxDate.hours` | • If Hour == `minDate.hours`: ≥ `minDate.minutes`<br>• If Hour == `maxDate.hours`: ≤ `maxDate.minutes`<br>• If `minDate.hours` < Hour < `maxDate.hours`: Full range (00–59) | • **On date select:** Auto-set time to `minDate.hours : minDate.minutes`.<br>• Lock values strictly within the time window of that single day.                                        |

---

> **⚠️ Edge Case — Minute Selected Before Hour**
>
> If the user picks a **minute value before committing an hour** (e.g. via rapid interaction or direct minute-first input), the resulting `hour:minute` pair may fall outside the valid range for the currently selected date. In this case, **auto-correct both values** to the nearest valid boundary:
>
> | Violation                                | Auto-Correction                                                                                     |
> | :--------------------------------------- | :-------------------------------------------------------------------------------------------------- |
> | Combined time is **below** the minimum   | Snap to `minDate.hours : minDate.minutes` (or `00:00` for Normal / maxDate)                         |
> | Combined time is **above** the maximum   | Snap to `maxDate.hours : maxDate.minutes`                                                           |
> | Hour becomes invalid after minute is set | Re-evaluate and clamp hour to the allowed range first, then re-validate minute against the new hour |

# TimePicker Component — Test Case Import Guidelines

> **MIN column is inactive until an hour is confirmed.** The hour menu always applies its restraint first; minute restraint is derived from the selected hour.

| Constraint Config                                                            | Hour Menu (HRS)                   | Minute Menu (MIN)<br>_(after hour confirmed)_ | Init / Auto-Correct Behavior                                                                                |
| :--------------------------------------------------------------------------- | :-------------------------------- | :-------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| **No constraints**                                                           | Full range: `00–23`               | Full range: `00–59`                           | Init: `00:00`                                                                                               |
| **`minTime` only**<br>Hour == `minTime.hours`                                | ≥ `minTime.hours`                 | ≥ `minTime.minutes`                           | Init: `minTime.hours : minTime.minutes`<br>Hour → `minTime.hours`: clamp minute **up** to `minTime.minutes` |
| **`minTime` only**<br>Hour > `minTime.hours`                                 | ≥ `minTime.hours`                 | Full range: `00–59`                           | No minute correction needed                                                                                 |
| **`maxTime` only**<br>Hour == `maxTime.hours`                                | ≤ `maxTime.hours`                 | ≤ `maxTime.minutes`                           | Init: `00:00`<br>Hour → `maxTime.hours`: clamp minute **down** to `maxTime.minutes`                         |
| **`maxTime` only**<br>Hour < `maxTime.hours`                                 | ≤ `maxTime.hours`                 | Full range: `00–59`                           | No minute correction needed                                                                                 |
| **Both** (`minTime` + `maxTime`)<br>Hour == `minTime.hours`                  | `minTime.hours` – `maxTime.hours` | ≥ `minTime.minutes`                           | Init: `minTime.hours : minTime.minutes`<br>Hour → `minTime.hours`: clamp minute **up**                      |
| **Both** (`minTime` + `maxTime`)<br>`minTime.hours` < Hour < `maxTime.hours` | `minTime.hours` – `maxTime.hours` | Full range: `00–59`                           | Entering this range: restore full minute, keep current value                                                |
| **Both** (`minTime` + `maxTime`)<br>Hour == `maxTime.hours`                  | `minTime.hours` – `maxTime.hours` | ≤ `maxTime.minutes`                           | Hour → `maxTime.hours`: clamp minute **down**                                                               |
| **Same-hour lock**<br>`minTime.hours` == `maxTime.hours`                     | Locked to `minTime.hours` only    | `minTime.minutes` – `maxTime.minutes`         | Init: `minTime.hours : minTime.minutes`<br>Hour fixed; clamp minute into range on any change                |

---

> **⚠️ Edge Case — Minute Selected Before Hour**
>
> If a minute is committed before an hour is confirmed, apply corrections in this order:
>
> 1. **Resolve hour first** — clamp to the valid hour range based on active constraints.
> 2. **Re-evaluate minute** — determine the valid minute range for the resolved hour, then correct.
>
> | Violation                                                             | Auto-Correction                                        |
> | :-------------------------------------------------------------------- | :----------------------------------------------------- |
> | Combined time **below** `minTime`                                     | Snap both to `minTime.hours : minTime.minutes`         |
> | Combined time **above** `maxTime`                                     | Snap both to `maxTime.hours : maxTime.minutes`         |
> | Minute out of range for the subsequently selected hour                | Clamp minute to nearest valid boundary for that hour   |
> | Same-hour lock — minute outside `[minTime.minutes – maxTime.minutes]` | Clamp minute into the locked range; hour remains fixed |
