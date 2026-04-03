import type { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { stringify } from 'yaml';
import { openApiDocument } from './openapi';

const openApiYaml = stringify(openApiDocument);

export function registerSwagger(app: Express): void {
  app.get('/openapi.json', (_req: Request, res: Response) => {
    res.status(200).json(openApiDocument);
  });

  app.get('/openapi.yaml', (_req: Request, res: Response) => {
    res.type('application/yaml').status(200).send(openApiYaml);
  });

  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      explorer: true,
      customSiteTitle: 'Zorvyn Finance API Docs',
    })
  );
}
