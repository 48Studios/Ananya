import { describe, it, expect } from "vitest";
import { Lead } from "./leads/lead";
import { CrmAccount } from "./accounts/crm-account";
import { Opportunity } from "./opportunities/opportunity";
import { Activity } from "./activities/activity";
import { Note } from "./notes/note";

describe("CRM Bounded Context Aggregates", () => {
  describe("Lead Aggregate", () => {
    it("should create a NEW lead and transition to QUALIFIED and CONVERTED", () => {
      const lead = Lead.create({
        leadNumber: "LEAD-2026-0001",
        name: "Sarah Connor",
        company: "Cyberdyne Systems",
        email: "sarah@cyberdyne.io",
        owner: "rep-1",
      });

      expect(lead.status).toBe("NEW");
      expect(lead.company).toBe("Cyberdyne Systems");

      lead.qualify();
      expect(lead.status).toBe("QUALIFIED");

      lead.convert("acc-99");
      expect(lead.status).toBe("CONVERTED");
      expect(lead.convertedAccountId).toBe("acc-99");
    });

    it("should throw error when converting an un-qualified lead", () => {
      const lead = Lead.create({
        leadNumber: "LEAD-2026-0002",
        name: "John Doe",
        company: "Acme Corp",
        owner: "rep-1",
      });

      expect(() => lead.convert("acc-100")).toThrow();
    });
  });

  describe("CrmAccount & Contact Aggregate", () => {
    it("should create CrmAccount and attach primary Contact", () => {
      const account = CrmAccount.create({
        companyName: "Stark Industries",
        industry: "Defense & Energy",
      });

      expect(account.isArchived).toBe(false);

      const contact = account.addContact({
        firstName: "Tony",
        lastName: "Stark",
        email: "tony@stark.com",
        role: "EXECUTIVE",
      });

      expect(contact.isPrimary).toBe(true);
      expect(account.contacts.length).toBe(1);

      account.archive();
      expect(account.isArchived).toBe(true);
    });
  });

  describe("Opportunity Aggregate", () => {
    it("should manage stage pipeline progression from PROSPECTING to WON", () => {
      const opp = Opportunity.create({
        opportunityNumber: "OPP-2026-0001",
        name: "Enterprise Cloud Deployment",
        crmAccountId: "acc-1",
        estimatedValue: 150000,
        expectedCloseDate: new Date("2026-12-31"),
      });

      expect(opp.stage).toBe("PROSPECTING");
      expect(opp.probability).toBe(20);

      opp.advanceStage("PROPOSAL");
      expect(opp.stage).toBe("PROPOSAL");
      expect(opp.probability).toBe(60);

      opp.closeWon();
      expect(opp.stage).toBe("WON");
      expect(opp.probability).toBe(100);
    });

    it("should throw error when closing a lost opportunity as won", () => {
      const opp = Opportunity.create({
        opportunityNumber: "OPP-2026-0002",
        name: "Hardware Refresh",
        crmAccountId: "acc-1",
        estimatedValue: 50000,
        expectedCloseDate: new Date("2026-09-30"),
      });

      opp.closeLost("Competitor won price bid");
      expect(opp.stage).toBe("LOST");
      expect(() => opp.closeWon()).toThrow();
    });
  });

  describe("Activity Aggregate", () => {
    it("should schedule and complete CRM activities", () => {
      const activity = Activity.create({
        type: "MEETING",
        subject: "Architecture Discovery Workshop",
        dueDate: new Date(),
        owner: "rep-1",
        relatedAccountId: "acc-1",
      });

      expect(activity.status).toBe("SCHEDULED");
      activity.complete();
      expect(activity.status).toBe("COMPLETED");
    });
  });

  describe("Note Entity", () => {
    it("should create timestamped note attached to CRM account", () => {
      const note = Note.create({
        author: "rep-1",
        body: "Client confirmed budget approval for Q3 deployment.",
        crmAccountId: "acc-1",
      });

      expect(note.body).toContain("budget approval");
      expect(note.crmAccountId).toBe("acc-1");
    });
  });
});
