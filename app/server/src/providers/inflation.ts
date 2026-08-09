import { config } from '../config';
import type { InflationProvider, InflationSnapshot } from './types';

export class MockInflationProvider implements InflationProvider {
  readonly name = 'mock';

  async getSnapshot(): Promise<InflationSnapshot> {
    return { annualRatePct: 4.5, asOf: new Date().toISOString(), source: 'mock (INPC proxy)' };
  }
}

export class BanxicoInflationProvider implements InflationProvider {
  readonly name = 'banxico';
  private baseUrl = 'https://www.banxico.org.mx/SieAPIRest/service/v1';

  constructor(private token: string) {}

  async getSnapshot(): Promise<InflationSnapshot> {
    // INPC (national consumer price index), timely observation.
    const res = await fetch(`${this.baseUrl}/series/SP74665/datos/oportuno`, {
      headers: { BmxToken: this.token, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Banxico ${res.status}`);
    const json = (await res.json()) as {
      bmx: { series: { datos: { fecha: string; dato: string }[] }[] };
    };
    const datos = json.bmx.series[0]?.datos ?? [];
    if (datos.length < 13) throw new Error('Banxico returned insufficient INPC history');
    const latest = Number(datos[datos.length - 1].dato);
    const yearAgo = Number(datos[datos.length - 13].dato);
    const annualRatePct = ((latest / yearAgo) - 1) * 100;
    return {
      annualRatePct,
      asOf: datos[datos.length - 1].fecha,
      source: 'banxico',
    };
  }
}

export function createInflationProvider(): InflationProvider {
  if (config.banxicoToken) return new BanxicoInflationProvider(config.banxicoToken);
  return new MockInflationProvider();
}
