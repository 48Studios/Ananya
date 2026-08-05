'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import {
  suppliersApi,
  type SupplierDto,
  type CreateSupplierPayload,
  type UpdateSupplierPayload,
} from '@/lib/api/suppliers-api'

const supplierSchema = z.object({
  code: z
    .string()
    .min(1, 'Supplier code is required')
    .transform((val) => val.trim().toUpperCase()),
  name: z
    .string()
    .min(1, 'Supplier name is required')
    .transform((val) => val.trim()),
  taxId: z.string().optional().nullable(),
  paymentTerms: z
    .string()
    .min(1, 'Payment terms are required')
    .transform((val) => val.trim().toUpperCase()),
  currency: z
    .string()
    .min(1, 'Currency code is required')
    .transform((val) => val.trim().toUpperCase()),
})

export type SupplierFormValues = z.infer<typeof supplierSchema>

interface SupplierFormProps {
  initialData?: SupplierDto | null
  onSuccess: (savedSupplier: SupplierDto) => void
  onCancel: () => void
}

export function SupplierForm({
  initialData,
  onSuccess,
  onCancel,
}: SupplierFormProps) {
  const [serverError, setServerError] = React.useState<string | null>(null)
  const isEditing = Boolean(initialData)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      code: initialData?.code ?? '',
      name: initialData?.name ?? '',
      taxId: initialData?.taxId ?? '',
      paymentTerms: initialData?.paymentTerms ?? 'NET30',
      currency: initialData?.currency ?? 'USD',
    },
  })

  const onSubmit = async (values: SupplierFormValues) => {
    setServerError(null)
    try {
      if (isEditing && initialData) {
        const payload: UpdateSupplierPayload = {
          code: values.code,
          name: values.name,
          taxId: values.taxId || null,
          paymentTerms: values.paymentTerms,
          currency: values.currency,
        }
        const updated = await suppliersApi.update(initialData.id, payload)
        onSuccess(updated)
      } else {
        const payload: CreateSupplierPayload = {
          code: values.code,
          name: values.name,
          taxId: values.taxId || null,
          paymentTerms: values.paymentTerms,
          currency: values.currency,
        }
        const created = await suppliersApi.create(payload)
        onSuccess(created)
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message)
      } else {
        setServerError(isEditing ? 'Failed to update supplier' : 'Failed to create supplier')
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {serverError}
        </div>
      )}

      {/* Code */}
      <Field>
        <FieldLabel htmlFor="supplier-code">
          Supplier Code <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="supplier-code"
          type="text"
          placeholder="e.g. SUP-ARROW-01"
          {...register('code')}
          className="uppercase font-mono"
        />
        {errors.code?.message && <FieldError>{errors.code.message}</FieldError>}
      </Field>

      {/* Name */}
      <Field>
        <FieldLabel htmlFor="supplier-name">
          Supplier Name <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="supplier-name"
          type="text"
          placeholder="e.g. Arrow Electronics Corp"
          {...register('name')}
        />
        {errors.name?.message && <FieldError>{errors.name.message}</FieldError>}
      </Field>

      {/* Tax ID */}
      <Field>
        <FieldLabel htmlFor="supplier-tax">Tax ID / GST Number</FieldLabel>
        <Input
          id="supplier-tax"
          type="text"
          placeholder="e.g. US-987654321 / GSTIN1234"
          {...register('taxId')}
          className="font-mono"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        {/* Payment Terms */}
        <Field>
          <FieldLabel htmlFor="supplier-terms">
            Payment Terms <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="supplier-terms"
            type="text"
            placeholder="e.g. NET30, NET60, COD"
            {...register('paymentTerms')}
            className="uppercase font-mono"
          />
          {errors.paymentTerms?.message && <FieldError>{errors.paymentTerms.message}</FieldError>}
        </Field>

        {/* Currency */}
        <Field>
          <FieldLabel htmlFor="supplier-currency">
            Currency <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            id="supplier-currency"
            type="text"
            placeholder="e.g. USD, EUR, INR"
            {...register('currency')}
            className="uppercase font-mono"
          />
          {errors.currency?.message && <FieldError>{errors.currency.message}</FieldError>}
        </Field>
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          {isEditing ? 'Save Changes' : 'Create Supplier'}
        </Button>
      </div>
    </form>
  )
}

