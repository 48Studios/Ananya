import { describe, it, expect } from 'vitest';
import { Customer } from './customers/customer';
import { Quotation } from './quotations/quotation';
import { SalesOrder } from './sales-orders/sales-order';
import { FulfillmentRequest } from './fulfillment/fulfillment-request';
import { CustomerReturn } from './returns/customer-return';

describe('Sales Bounded Context Aggregates', () => {
  describe('Customer Aggregate', () => {
    it('should create an ACTIVE customer by default', () => {
      const customer = Customer.create({
        customerNumber: 'CUST-2026-0001',
        name: 'Acme Electronics Ltd',
        email: 'billing@acme.com',
      });
      expect(customer.customerNumber).toBe('CUST-2026-0001');
      expect(customer.status).toBe('DRAFT');
      expect(customer.creditStatus).toBe('OK');
    });

    it('should add contacts and addresses', () => {
      const customer = Customer.create({
        customerNumber: 'CUST-2026-0002',
        name: 'Stark Industries',
        email: 'pepper@stark.com',
      });
      customer.addContact({
        name: 'Pepper Potts',
        email: 'pepper@stark.com',
        isPrimary: true,
      });
      customer.addAddress({
        addressType: 'BILLING',
        street1: '10880 Wilshire Blvd',
        city: 'Los Angeles',
        postalCode: '90024',
        country: 'US',
      });

      expect(customer.contacts).toHaveLength(1);
      expect(customer.contacts[0]!.name).toBe('Pepper Potts');
      expect(customer.addresses).toHaveLength(1);
      expect(customer.addresses[0]!.city).toBe('Los Angeles');
    });
  });

  describe('Quotation Aggregate', () => {
    it('should calculate quotation total prices and transition lifecycle', () => {
      const quotation = Quotation.create({
        quoteNumber: 'QUO-2026-0001',
        customerId: 'cust-1',
      });
      quotation.addLine({
        componentId: 'comp-1',
        quantity: 10,
        unitPrice: 15,
        discount: 10,
      });

      expect(quotation.status).toBe('DRAFT');
      expect(quotation.lines[0]!.totalPrice).toBe(135);

      quotation.send();
      expect(quotation.status).toBe('SENT');

      quotation.accept();
      expect(quotation.status).toBe('ACCEPTED');
    });
  });

  describe('SalesOrder Aggregate', () => {
    it('should enforce order line item calculations and status transitions', () => {
      const order = SalesOrder.create({
        orderNumber: 'SO-2026-0001',
        customerId: 'cust-1',
      });
      order.addLine({
        componentId: 'comp-1',
        quantity: 5,
        unitPrice: 100,
        discount: 0,
        tax: 5,
      });

      expect(order.status).toBe('DRAFT');
      expect(order.lines[0]!.totalPrice).toBe(525);

      order.approve();
      expect(order.status).toBe('APPROVED');

      order.release();
      expect(order.status).toBe('RELEASED');
    });
  });

  describe('FulfillmentRequest Aggregate', () => {
    it('should progress fulfillment request through pick, pack, ship, complete', () => {
      const request = FulfillmentRequest.create({
        requestNumber: 'FUL-2026-0001',
        salesOrderId: 'so-1',
        warehouseId: 'wh-1',
      });
      request.addLine({
        salesOrderLineId: 'sol-1',
        componentId: 'comp-1',
        requestedQuantity: 5,
      });

      expect(request.status).toBe('PENDING');

      request.accept();
      expect(request.status).toBe('ACCEPTED');

      request.startPicking();
      expect(request.status).toBe('PICKING');

      request.pack();
      expect(request.status).toBe('PACKED');

      request.ship('DHL Express', 'TRK-99482');
      expect(request.status).toBe('SHIPPED');
      expect(request.trackingNumber).toBe('TRK-99482');

      request.complete();
      expect(request.status).toBe('COMPLETED');
    });
  });

  describe('CustomerReturn Aggregate', () => {
    it('should handle return inspection and restocking lifecycle', () => {
      const customerReturn = CustomerReturn.create({
        returnNumber: 'RMA-2026-0001',
        customerId: 'cust-1',
        salesOrderId: 'so-1',
      });
      const line = customerReturn.addLine({
        salesOrderLineId: 'sol-1',
        componentId: 'comp-1',
        quantity: 2,
        reason: 'DEFECTIVE',
      });

      expect(customerReturn.status).toBe('DRAFT');

      customerReturn.approve();
      expect(customerReturn.status).toBe('APPROVED');

      customerReturn.receive();
      expect(customerReturn.status).toBe('RECEIVED');

      customerReturn.inspect({ [line.id]: 'RESTOCK' });
      expect(customerReturn.status).toBe('INSPECTED');
      expect(customerReturn.lines[0]!.disposition).toBe('RESTOCK');

      customerReturn.restock();
      expect(customerReturn.status).toBe('RESTOCKED');
    });
  });
});
