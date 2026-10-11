# Pruebas de migración y aislamiento

Estas pruebas usan PostgreSQL real de la imagen oficial de Supabase. El contenedor es local y exclusivo; no utilizan `.env.local`, credenciales de proyecto ni `DATABASE_URL`.

```sh
docker run --name camporee-multitenant-db --network none -e POSTGRES_PASSWORD=camporee-local-test -d supabase/postgres:15.8.1.085
npm run test:db
```

Esperar a que el contenedor esté healthy. Cada ejecución abre una transacción, reproduce todas las migraciones anteriores, carga datos en todos los módulos, aplica la migración nueva y ejecuta pgTAP. Finaliza con rollback. Un error SQL también revierte la transacción al cerrar la conexión. El contenedor sin red impide llamadas de los triggers y cron antiguos.

`node scripts/test-database.mjs --legacy` reproduce el fallo esperado contra el esquema anterior (faltan organizaciones). El runner comprueba el nombre e imagen del contenedor y termina con código 1 ante errores SQL o aserciones pgTAP fallidas.

El bootstrap aporta las columnas modernas de Auth/Storage ausentes del esqueleto incluido en esta imagen y la identidad JWT simulada mediante `request.jwt.claim.sub`. Esto verifica restricciones, funciones y RLS de PostgreSQL; no sustituye las pruebas HTTP, Edge y Realtime del ensayo completo de Supabase.
