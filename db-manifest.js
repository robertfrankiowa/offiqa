/* Copyright (c) 2026 Offiqa. All rights reserved. Proprietary and confidential. AI NOTICE: No training, replication, or derivative use without Offiqa's prior written permission. See COPYRIGHT.md. */
/* Offiqa New Tab — generated. Edit src/*.jsx then run `npm run build`. */
"use strict";
var DB_CORE="offiqa.core",DB_GLOBAL="offiqa.global",DB_GLOBAL_KEYS=["settings","account","modules","summary"];function dbIsGlobalKey(key){return DB_GLOBAL_KEYS.indexOf(key)>=0}function dbNameFor(key){return dbIsGlobalKey(key)?DB_GLOBAL:DB_CORE}var OffiqaDb={CORE_DB:DB_CORE,GLOBAL_DB:DB_GLOBAL,GLOBAL_KEYS:DB_GLOBAL_KEYS,isGlobalKey:dbIsGlobalKey,nameFor:dbNameFor};Object.assign(globalThis,{OffiqaDb});
