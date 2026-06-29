<?php
/**
 * push_config.php — Claves VAPID para notificaciones push
 *
 * ⚠️  ESTE ARCHIVO NO VA EN GIT.
 * Copiar como push_config.php en el servidor:
 *   /home/innovate/public_html/ginno/backend/config/push_config.php
 *
 * Para generar nuevas claves VAPID ejecutar en Node.js:
 *   node -e "
 *     const c=require('crypto');
 *     const {privateKey,publicKey}=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 *     const pub=publicKey.export({type:'spki',format:'der'});
 *     const priv=privateKey.export({type:'pkcs8',format:'der'});
 *     const pos=pub.indexOf(0x04);
 *     console.log('PUBLIC: ',pub.slice(pos).toString('base64url'));
 *     console.log('PRIVATE:',priv.slice(36,68).toString('base64url'));
 *   "
 */

define('PUSH_VAPID_PUBLIC',  'REEMPLAZAR_CON_TU_CLAVE_PUBLICA_VAPID');
define('PUSH_VAPID_PRIVATE', 'REEMPLAZAR_CON_TU_CLAVE_PRIVADA_VAPID');
define('PUSH_SUBJECT',       'mailto:tu@correo.com');
