package api

import (
	"fmt"
	"testing"
	"time"
)

func TestWorkspacePagesFreezeMembershipAndRejectForeignCursor(t *testing.T) {
	f := newFixture(t)
	buddy := f.browser("buddy-a")
	intern := f.browser("intern-a")
	for i := 0; i < 23; i++ {
		buddy.publishedBrief(internA)
	}
	page := intern.call("GET", "/api/v4/workspaces?limit=3", nil, 200)
	firstCursor := str(page["next_cursor"])
	f.browser("intern-b").call("GET", "/api/v4/workspaces?cursor="+firstCursor, nil, 422)
	for _, query := range []string{"limit=0", "limit=21", "limit=bad", "cursor=invalid", "limit=1&limit=1", "owner=foreign"} {
		intern.call("GET", "/api/v4/workspaces?"+query, nil, 422)
	}
	buddy.publishedBrief(internA) // Arrives after the page snapshot, so belongs to the next read.
	found := map[string]bool{}
	asOf := page["as_of"]
	for {
		if page["as_of"] != asOf {
			t.Fatal("snapshot moved")
		}
		for _, item := range list(page["items"]) {
			id := str(obj(item)["id"])
			if found[id] {
				t.Fatal("duplicate", id)
			}
			found[id] = true
		}
		if page["next_cursor"] == nil {
			break
		}
		page = intern.call("GET", "/api/v4/workspaces?limit=3&cursor="+str(page["next_cursor"]), nil, 200)
	}
	if len(found) != 23 {
		t.Fatal("lost a page or included a new assignment", len(found))
	}
}

func TestTimelinePagesUseReceiptCutoffAndStableTies(t *testing.T) {
	f := newFixture(t)
	intern := f.browser("intern-a")
	g := intern.goal()
	goalID := str(g["id"])
	baseline := len(list(intern.call("GET", "/api/v4/goals/"+goalID+"/evidence-timeline", nil, 200)["items"]))
	at := time.Now().Add(-time.Hour)
	for i := 1; i <= 53; i++ {
		id := fmt.Sprintf("90000000-0000-4000-8000-%012d", i)
		f.sql("INSERT INTO app.verification_checks(id,goal_id,step_id,method,operation_key,status,observed_at) VALUES ($1,$2,'select_resource','resource_policy_match',$1,'passed',$3)", id, goalID, at)
	}
	path := "/api/v4/goals/" + goalID + "/evidence-timeline"
	before := f.count("SELECT count(*) FROM app.business_events")
	page := intern.call("GET", path+"?limit=7", nil, 200)
	// A late check has an old observed_at but a fresh received_at. It cannot enter this snapshot.
	late := uuid()
	f.sql("INSERT INTO app.verification_checks(id,goal_id,step_id,method,operation_key,status,observed_at) VALUES ($1,$2,'select_resource','resource_policy_match',$1,'passed',$3)", late, goalID, at.Add(-time.Hour))
	found := map[string]bool{}
	for {
		for _, value := range list(page["items"]) {
			id := str(obj(value)["id"])
			if found[id] || id == late {
				t.Fatal("duplicate/late event", id)
			}
			found[id] = true
		}
		if page["next_cursor"] == nil {
			break
		}
		page = intern.call("GET", path+"?limit=7&cursor="+str(page["next_cursor"]), nil, 200)
	}
	if len(found) != 53+baseline || f.count("SELECT count(*) FROM app.business_events") != before {
		t.Fatal("timeline pages lost history or wrote state", len(found))
	}
}
