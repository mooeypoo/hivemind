/**
 * Where this code is running, from Netlify's function context: `production`,
 * `deploy-preview`, `branch-deploy`, or `dev` (local `netlify dev`). Unknown means production,
 * the most restrictive choice.
 */
export type DeployContext = 'production' | 'deploy-preview' | 'branch-deploy' | 'dev';

export const deployContextFrom = (value: string | undefined): DeployContext =>
  value === 'deploy-preview' || value === 'branch-deploy' || value === 'dev' ? value : 'production';

export const isProduction = (context: DeployContext): boolean => context === 'production';
