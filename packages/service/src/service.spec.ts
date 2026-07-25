import { describe, it, expect } from 'vitest';
import { ServiceRequest } from './requests/service-request';
import { WorkOrder } from './work-orders/work-order';
import { WarrantyClaim } from './warranty/warranty-claim';
import { RmaRequest } from './rma/rma-request';
import { MaintenanceSchedule } from './maintenance/maintenance-schedule';

describe('Service Management Bounded Context Aggregates', () => {
  describe('ServiceRequest Aggregate', () => {
    it('should manage service request lifecycle', () => {
      const request = ServiceRequest.create({
        serviceNumber: 'SRV-2026-0001',
        customerId: 'cust-100',
        title: 'Server Power Supply Fault',
        category: 'HARDWARE',
        priority: 'HIGH',
      });

      expect(request.status).toBe('OPEN');
      request.assign('tech-bob');
      expect(request.status).toBe('ASSIGNED');
      expect(request.assignedTechnician).toBe('tech-bob');

      request.diagnose('Faulty capacitor on primary PSU channel.');
      expect(request.status).toBe('DIAGNOSING');
      expect(request.diagnosticNotes).toBe('Faulty capacitor on primary PSU channel.');

      request.startRepair();
      expect(request.status).toBe('REPAIRING');

      request.complete();
      expect(request.status).toBe('COMPLETED');

      request.close();
      expect(request.status).toBe('CLOSED');
    });

    it('should throw error when closing a cancelled service request', () => {
      const request = ServiceRequest.create({
        serviceNumber: 'SRV-2026-0002',
        customerId: 'cust-100',
        title: 'Duplicate Ticket',
        category: 'SOFTWARE',
      });
      request.cancel();
      expect(() => request.close()).toThrow();
    });
  });

  describe('WorkOrder Aggregate', () => {
    it('should manage work order status and log actual labor hours', () => {
      const wo = WorkOrder.create({
        workOrderNumber: 'WO-2026-0001',
        serviceRequestId: 'srv-10',
        assignedTechnician: 'tech-bob',
        title: 'Replace PSU Capacitor',
        plannedHours: 4,
        priority: 'HIGH',
      });

      expect(wo.status).toBe('ASSIGNED');
      wo.start();
      expect(wo.status).toBe('IN_PROGRESS');

      wo.logHours(2.5);
      expect(wo.actualHours).toBe(2.5);

      wo.pause();
      expect(wo.status).toBe('PAUSED');

      wo.complete();
      expect(wo.status).toBe('COMPLETED');
    });
  });

  describe('WarrantyClaim Aggregate', () => {
    it('should review and approve valid warranty claim', () => {
      const claim = WarrantyClaim.create({
        warrantyNumber: 'WAR-2026-0001',
        customerId: 'cust-100',
        productId: 'prod-50',
        purchaseDate: new Date('2025-01-01'),
        expiryDate: new Date('2027-01-01'),
        claimReason: 'PSU failure within 2-year warranty window.',
      });

      expect(claim.decision).toBe('SUBMITTED');
      claim.review();
      expect(claim.decision).toBe('UNDER_REVIEW');

      claim.approve('Fully covered under standard hardware warranty.');
      expect(claim.decision).toBe('APPROVED');
    });

    it('should mark claim as EXPIRED when expiry date is in the past', () => {
      const claim = WarrantyClaim.create({
        warrantyNumber: 'WAR-2026-0002',
        customerId: 'cust-100',
        productId: 'prod-50',
        purchaseDate: new Date('2020-01-01'),
        expiryDate: new Date('2022-01-01'),
        claimReason: 'Out of warranty defect',
      });

      expect(claim.decision).toBe('EXPIRED');
    });
  });

  describe('RmaRequest Aggregate', () => {
    it('should transition RMA request through return receipt and inspection', () => {
      const rma = RmaRequest.create({
        rmaNumber: 'RMA-2026-0001',
        customerId: 'cust-100',
        itemDescription: 'Defective Power Supply Unit',
        reason: 'Overheating under load',
      });

      expect(rma.status).toBe('REQUESTED');
      rma.approve();
      expect(rma.status).toBe('APPROVED');

      rma.receive();
      expect(rma.status).toBe('RECEIVED');

      rma.inspect('REPAIR', 'Internal capacitor damaged. Sent to repair line.');
      expect(rma.status).toBe('INSPECTED');
      expect(rma.disposition).toBe('REPAIR');

      rma.process();
      expect(rma.status).toBe('PROCESSED');

      rma.close();
      expect(rma.status).toBe('CLOSED');
    });
  });

  describe('MaintenanceSchedule Aggregate', () => {
    it('should advance next visit date upon completing recurring visit', () => {
      const initialDate = new Date('2026-08-01');
      const schedule = MaintenanceSchedule.create({
        scheduleNumber: 'SCH-2026-0001',
        customerId: 'cust-100',
        assetName: 'HVAC Industrial Cooler #3',
        frequency: 'QUARTERLY',
        nextVisitDate: initialDate,
        assignedTechnician: 'tech-bob',
      });

      expect(schedule.status).toBe('ACTIVE');
      schedule.completeVisit();

      const expectedDate = new Date('2026-11-01');
      expect(schedule.nextVisitDate.getMonth()).toBe(expectedDate.getMonth());
    });
  });
});
