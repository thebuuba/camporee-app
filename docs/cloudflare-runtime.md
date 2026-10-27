# Validación del despliegue en Cloudflare

El incidente del 27 de octubre de 2026 tenía dos causas independientes:

- pnpm 9.10.0 rechazaba `pnpm-workspace.yaml` sin `packages`. El único paquete del proyecto es `.`.
- OpenNext 1.20.6 compilaba, pero omitía `server/preview-props.json` de Next 16.4. El Worker fallaba al crear `NextNodeServer`, con `Unexpected loadManifest(/.next/server/preview-props.json) call!` y error 1101.

OpenNext 1.20.13 incorpora [la corrección oficial del manifiesto](https://github.com/opennextjs/opennextjs-cloudflare/pull/1356). Se conserva Next 16.4.3. El override de `@node-minify/core > glob` a 10.5.0 mantiene la actualización transitiva de seguridad tanto en npm como en pnpm.

CI comprueba la instalación con `pnpm@9.10.0 --frozen-lockfile`, construye con OpenNext y arranca el bundle en Wrangler. `scripts/test-worker.mjs` exige respuestas 200 con formularios reales en `/login`, `/signup` e Inicio sin sesión. No escribe datos ni inicia sesión.

Para comprobar el artefacto local, ejecutar en dos terminales:

```sh
npx opennextjs-cloudflare build
npx wrangler dev --ip 127.0.0.1 --port 8787
```

```sh
node scripts/test-worker.mjs
```

También acepta la URL de una preview o del despliegue público. Una compilación correcta de Next o OpenNext por sí sola no valida el runtime del Worker.

En Windows, OpenNext puede fallar al crear symlinks con el layout de pnpm; CI realiza este recorrido en Linux. No se deben cambiar permisos globales del sistema para ocultar ese fallo.
