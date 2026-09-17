import { DomainError } from "@ananya/core";

export class InvalidAttributeCodeError extends DomainError {
  constructor(message = "Invalid attribute code") {
    super(message);
    this.name = "InvalidAttributeCodeError";
  }
}

export class InvalidAttributeNameError extends DomainError {
  constructor(message = "Invalid attribute name") {
    super(message);
    this.name = "InvalidAttributeNameError";
  }
}

export class InvalidAttributeDataTypeError extends DomainError {
  constructor(message = "Invalid attribute data type") {
    super(message);
    this.name = "InvalidAttributeDataTypeError";
  }
}

export class AttributeDefinitionNotFoundError extends DomainError {
  constructor(idOrCode: string) {
    super(`Attribute definition '${idOrCode}' not found`);
    this.name = "AttributeDefinitionNotFoundError";
  }
}

export class AttributeOptionNotFoundError extends DomainError {
  constructor(idOrCode: string) {
    super(`Attribute option '${idOrCode}' not found`);
    this.name = "AttributeOptionNotFoundError";
  }
}

export class AttributeValueValidationError extends DomainError {
  constructor(attributeCode: string, reason: string) {
    super(`Validation failed for attribute '${attributeCode}': ${reason}`);
    this.name = "AttributeValueValidationError";
  }
}
