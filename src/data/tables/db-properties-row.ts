// Hand-maintained extension of the generated base class for 'db_properties'.
// The generator will NOT overwrite this file.
// Add domain-specific lookup helpers here, e.g.:
//   static byCode(code: string) { return ReferenceData.all(DbPropertiesRow).find(...) }

import { _DbPropertiesRowBase } from '../generated/_db-properties-row-base.js';
import { ReferenceData } from '../orm/reference-data.js';

export class DbPropertiesRow extends _DbPropertiesRowBase {}

ReferenceData.register(DbPropertiesRow);
