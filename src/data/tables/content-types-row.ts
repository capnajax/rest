// Hand-maintained extension of the generated base class for 'content_types'.
// The generator will NOT overwrite this file.
// Add domain-specific lookup helpers here, e.g.:
//   static byCode(code: string) { return ReferenceData.all(ContentTypesRow).find(...) }

import { _ContentTypesRowBase } from '../generated/_content-types-row-base.js';

export class ContentTypesRow extends _ContentTypesRowBase {
  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = super.toJSON();
    console.log("this.form_factor = %s", this.form_factor)
    result.form_factor = this.form_factor;
    return result;
  }
}
