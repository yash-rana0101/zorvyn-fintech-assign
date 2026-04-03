import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { stringify } from 'yaml';
import { openApiDocument } from '../src/docs/openapi';

const docsDir = resolve(process.cwd(), 'docs');
mkdirSync(docsDir, { recursive: true });

const jsonPath = join(docsDir, 'openapi.json');
const yamlPath = join(docsDir, 'openapi.yaml');

writeFileSync(jsonPath, `${JSON.stringify(openApiDocument, null, 2)}\n`, 'utf8');
writeFileSync(yamlPath, stringify(openApiDocument), 'utf8');

// eslint-disable-next-line no-console
console.log(`OpenAPI files written:\n- ${jsonPath}\n- ${yamlPath}`);
