# Migracion del backend a Docker en Render

## Objetivo

Ejecutar el backend de Operaciones Litio en una imagen Docker reproducible que
incluya las herramientas oficiales `mongodump` y `mongorestore`.

Esta preparacion no despliega cambios ni modifica la logica operacional.

## Arquitectura preparada

- Base: `node:22-bookworm-slim`.
- Inicio: `npm start` (`node src/server.js`).
- Puerto: variable `PORT` entregada por Render.
- MongoDB Database Tools: paquete oficial `mongodb-database-tools`.
- Usuario del proceso: `node` sin privilegios root.
- Directorio de respaldos: `/var/data/backups`.
- Verificacion de herramientas: ejecutada durante el build Docker.

El build falla automaticamente si alguno de estos comandos no funciona:

```bash
mongodump --version
mongorestore --version
```

## Variables requeridas

Mantener en Render las variables actuales del backend y agregar o confirmar:

```text
NODE_ENV=production
MONGODB_URI=<mongodb-atlas-uri>
JWT_SECRET=<secret>
BACKUP_DIR=/var/data/backups
MONGODUMP_PATH=/usr/bin/mongodump
MONGORESTORE_PATH=/usr/bin/mongorestore
BACKUP_COMMAND_TIMEOUT_MS=1800000
```

Render entrega `PORT` automaticamente. No fijarlo manualmente salvo que exista
una necesidad operacional concreta.

Las variables de correo, WhatsApp, CORS y demas integraciones deben conservarse
sin cambios.

## Configuracion recomendada en Render

### Web Service

1. Abrir el servicio backend existente en Render.
2. Respaldar la configuracion actual y las variables de entorno.
3. Verificar que la rama de despliegue sea `main`.
4. Cambiar el runtime del servicio a Docker.
5. Usar el `Dockerfile` ubicado en la raiz del backend.
6. No configurar Build Command: Docker ejecuta las instrucciones del archivo.
7. No configurar Start Command: Docker utiliza `CMD ["npm", "start"]`.
8. Mantener el Health Check Path en `/health`.
9. Realizar primero un despliegue manual en un servicio de staging.

### Disco persistente

Para conservar archivos despues de reinicios y nuevos despliegues:

1. Contratar o habilitar un Persistent Disk para el servicio.
2. Montarlo exactamente en:

```text
/var/data
```

3. Mantener:

```text
BACKUP_DIR=/var/data/backups
```

Sin disco persistente, los archivos generados en `/var/data/backups` siguen
siendo efimeros y pueden desaparecer al reiniciar o desplegar.

El disco persistente no debe considerarse la unica copia corporativa. Los
respaldos deben copiarse posteriormente a almacenamiento externo.

## Comandos locales de validacion

Requieren Docker Desktop o Docker Engine:

```bash
docker build -t operaciones-litio-backend:backup-ready .
docker run --rm operaciones-litio-backend:backup-ready mongodump --version
docker run --rm operaciones-litio-backend:backup-ready mongorestore --version
```

Prueba de inicio sin conectar a produccion:

```bash
docker run --rm -p 4000:4000 --env-file .env operaciones-litio-backend:backup-ready
```

Luego verificar:

```text
http://127.0.0.1:4000/health
```

## Verificacion posterior en Render

Desde Render Shell del servicio Docker:

```bash
whoami
which mongodump
which mongorestore
mongodump --version
mongorestore --version
echo "$BACKUP_DIR"
ls -ld /var/data /var/data/backups
```

Resultado esperado:

- Usuario: `node`.
- Herramientas ubicadas en `/usr/bin`.
- `BACKUP_DIR` apunta a `/var/data/backups`.
- El usuario `node` puede escribir en el directorio.

## Prueba controlada recomendada

No ejecutar restauraciones directamente contra produccion.

1. Crear una base Atlas separada para staging/recuperacion.
2. Generar un respaldo manual.
3. Confirmar que el archivo existe y tiene tamano mayor que cero.
4. Descargar y conservar el respaldo fuera de Render.
5. Restaurarlo en la base de staging.
6. Validar colecciones, cantidad de documentos y acceso de la aplicacion.
7. Registrar evidencia y tiempos de recuperacion.

## Riesgos y limitaciones

- `mongorestore --drop` es destructivo para la base destino.
- Un Persistent Disk de Render protege contra reinicios, pero no contra perdida
  del servicio, cuenta o proveedor.
- Los Cron Jobs de Render usan instancias separadas y almacenamiento efimero;
  deben subir el archivo a almacenamiento externo antes de finalizar.
- Los archivos actuales no tienen cifrado adicional a nivel de aplicacion.
- La URI de MongoDB es utilizada por las herramientas durante la ejecucion y
  debe mantenerse exclusivamente en variables secretas de Render.
- Esta preparacion no reemplaza MongoDB Atlas Cloud Backup.

## Siguiente etapa recomendada

1. Desplegar primero en staging.
2. Probar respaldo y restauracion sobre una base no productiva.
3. Habilitar MongoDB Atlas Cloud Backup como capa principal.
4. Integrar Cloudflare R2, S3 o Azure Blob para copia externa.
5. Cifrar archivos y definir retencion corporativa.
6. Documentar RPO, RTO y procedimiento de recuperacion aprobado por TI.
