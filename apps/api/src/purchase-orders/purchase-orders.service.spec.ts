import { Test, TestingModule } from '@nestjs/testing';
import {
  PurchaseOrdersService,
  PURCHASE_ORDER_REPOSITORY,
} from './purchase-orders.service';
import { SettingsService } from '../settings/settings.service';
import { resolveCurrency } from '../common/utils/currency-resolver';
import { PurchaseOrder } from '@ananya/procurement';

describe('Currency Resolution & PurchaseOrdersService', () => {
  describe('resolveCurrency Utility', () => {
    it('returns explicit currency when supplied (Explicit Override)', () => {
      const res = resolveCurrency({
        explicitCurrency: 'USD',
        organizationCurrency: 'INR',
        fallbackCurrency: 'INR',
      });
      expect(res).toBe('USD');
    });

    it('returns organization currency when explicit currency is absent (Organization Default)', () => {
      const res = resolveCurrency({
        explicitCurrency: undefined,
        organizationCurrency: 'INR',
        fallbackCurrency: 'INR',
      });
      expect(res).toBe('INR');
    });

    it('returns EUR when organization currency is configured as EUR (Different Organization)', () => {
      const res = resolveCurrency({
        explicitCurrency: undefined,
        organizationCurrency: 'EUR',
        fallbackCurrency: 'INR',
      });
      expect(res).toBe('EUR');
    });

    it('returns explicit EUR when CSV row provides explicit currency over org default INR', () => {
      const res = resolveCurrency({
        explicitCurrency: 'EUR',
        organizationCurrency: 'INR',
        fallbackCurrency: 'INR',
      });
      expect(res).toBe('EUR');
    });

    it('falls back to safe default when organization currency is null/unavailable (Missing Organization Setting)', () => {
      const res = resolveCurrency({
        explicitCurrency: undefined,
        organizationCurrency: null,
        fallbackCurrency: 'INR',
      });
      expect(res).toBe('INR');
    });
  });

  describe('PurchaseOrdersService.create Integration', () => {
    let service: PurchaseOrdersService;
    let mockPoRepository: any;
    let mockSettingsService: any;

    beforeEach(async () => {
      mockPoRepository = {
        generateNextPoNumber: jest.fn().mockResolvedValue('PO-2026-000001'),
        save: jest.fn().mockImplementation((po) => Promise.resolve(po)),
      };

      mockSettingsService = {
        getSystemSettings: jest.fn().mockResolvedValue({
          baseCurrency: 'INR',
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PurchaseOrdersService,
          {
            provide: PURCHASE_ORDER_REPOSITORY,
            useValue: mockPoRepository,
          },
          {
            provide: SettingsService,
            useValue: mockSettingsService,
          },
        ],
      }).compile();

      service = module.get<PurchaseOrdersService>(PurchaseOrdersService);
    });

    it('resolves PO currency to INR when org currency is INR and no currency supplied', async () => {
      mockSettingsService.getSystemSettings.mockResolvedValue({
        baseCurrency: 'INR',
      });

      const po = await service.create({
        supplierId: 'sup-1',
      });

      expect(po.currency).toBe('INR');
    });

    it('resolves PO currency to EUR when org currency is configured as EUR', async () => {
      mockSettingsService.getSystemSettings.mockResolvedValue({
        baseCurrency: 'EUR',
      });

      const po = await service.create({
        supplierId: 'sup-1',
      });

      expect(po.currency).toBe('EUR');
    });

    it('preserves explicit USD currency override when org currency is INR', async () => {
      mockSettingsService.getSystemSettings.mockResolvedValue({
        baseCurrency: 'INR',
      });

      const po = await service.create({
        supplierId: 'sup-1',
        currency: 'USD',
      });

      expect(po.currency).toBe('USD');
    });

    it('falls back to safe default INR when settings service fails or returns null', async () => {
      mockSettingsService.getSystemSettings.mockResolvedValue(null);

      const po = await service.create({
        supplierId: 'sup-1',
      });

      expect(po.currency).toBe('INR');
    });
  });
});
