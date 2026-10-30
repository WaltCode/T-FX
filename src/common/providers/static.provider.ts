import { FxProvider, STATIC_SNAPSHOT, UsdRates } from '../types.js';

/** Offline mode: treats the fixed table as the live feed. */
export class StaticFxProvider implements FxProvider {
  readonly name = 'static';

  fetchUsdRates(): Promise<UsdRates> {
    return Promise.resolve({ ...STATIC_SNAPSHOT.perUsd });
  }
}
