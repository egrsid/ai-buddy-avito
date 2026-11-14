package api

import "time"

const (
	impactWindow    = 7 * 24 * time.Hour
	impactMinCohort = 5
	impactLabel     = "описательное сравнение; различия групп могли повлиять на результат"
	impactPolicyRev = 1
)

// cohortView applies the v4 privacy rules to one version.
// Counts stay hidden when the cohort is too small or a cell is 1.
func cohortView(version, eligible, affected int) Object {
	view := Object{"version": version, "state": "no_exposure"}
	if eligible == 0 {
		return view
	}
	if eligible < impactMinCohort {
		view["state"] = "insufficient_data"
		return view
	}
	complement := eligible - affected
	if (affected > 0 && affected < 2) || (complement > 0 && complement < 2) {
		view["state"] = "suppressed"
		return view
	}
	view["state"] = "ready"
	view["eligible"] = eligible
	view["affected"] = affected
	view["rate"] = float64(affected) / float64(eligible)
	return view
}

// impactDelta returns percentage points of rate_b-rate_a.
// A suppressed side hides both cohorts and the delta so cells cannot be rebuilt by subtraction.
func impactDelta(before, after Object) (Object, Object, any) {
	if before["state"] == "suppressed" || after["state"] == "suppressed" {
		return Object{"version": before["version"], "state": "suppressed"}, Object{"version": after["version"], "state": "suppressed"}, nil
	}
	if before["state"] != "ready" || after["state"] != "ready" {
		return before, after, nil
	}
	delta := 100 * (after["rate"].(float64) - before["rate"].(float64))
	return before, after, delta
}

// exposureEligible is true when the episode covers a full observation window inside [from, to).
func exposureEligible(started time.Time, ended *time.Time, asOf, from, to time.Time) bool {
	if started.Before(from) || !started.Before(to) {
		return false
	}
	mature := started.Add(impactWindow)
	if mature.After(asOf) {
		return false
	}
	if ended != nil && ended.Before(mature) {
		return false
	}
	return true
}
