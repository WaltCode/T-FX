import { FIAT_MAP } from '../../common/money/currency.js';
import { AppConfig } from '../../config/index.js';
import { FxProvider, UsdRates, toUsdRates } from '../types.js';


export class OpenErApiProvider implements FxProvider {
  readonly name = 'open-er-api';
  async fetchUsdRates(): Promise<UsdRates> {
    const response = await fetch(AppConfig.fx.providerUrl, { signal: AbortSignal.timeout(AppConfig.fx.timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { result?: string; base_code?: string; rates?: Record<string, unknown> };
    if (body.result !== 'success' || body.base_code !== 'USD' || !body.rates) {
      throw new Error('Unexpected payload');
    }
    return toUsdRates(body.rates, (currency) => FIAT_MAP[currency]);
  }
}
