# Proportione Customizations

This file tracks all customizations made to this fork for easier upstream rebasing.

## Overview

This fork is maintained by Proportione for deploying a multichannel assistant bot.
Changes are kept minimal to reduce merge conflicts with upstream.

---

## ESTADO ACTUAL DEL PROYECTO (2026-01-28)

### Fase 1: Local Experimental - EN PROGRESO

**Completado:**
- [x] Fork configurado con remotes (origin=fork, upstream=original)
- [x] Node 22 configurado (.nvmrc)
- [x] Build funcionando correctamente
- [x] Gateway corriendo en local
- [x] WhatsApp vinculado y operativo
- [x] Plugin feria-mode scaffolding creado
- [x] Documentación inicial (BUILD_NOTES.md, CUSTOMIZATIONS.md)
- [x] Feature --qr-file para login WhatsApp
- [x] Repositorio subido a github.com/javiercuervo/moltbot

**Pendiente Fase 1:**
- [ ] Probar plugin feria-mode en producción
- [ ] Configurar canal Email (IMAP/SMTP)
- [ ] Test end-to-end de flujo completo (mensaje entrante → respuesta)
- [ ] Documentar identidad/personalidad del agente

### Próximo Paso Inmediato

**Configurar y probar el canal de Email:**
1. Añadir credenciales EMAIL_* a `.env`
2. Habilitar canal email en `~/.moltbot-javier/moltbot.json`
3. Probar envío/recepción de emails
4. Verificar integración con el agente

### Fases Futuras

| Fase | Descripción | Estado |
|------|-------------|--------|
| 2. Proportione Cloud | Migrar a servidor dedicado, systemd/Docker, SSL | Pendiente |
| 3. Instituto | Google Workspace (Calendar+Gmail), SSO, audit logs | Pendiente |

---

## Customization Log

### 2026-01-28 - Initial Setup

**Files Added:**
- `BUILD_NOTES.md` - Deployment documentation for Proportione setup
- `CUSTOMIZATIONS.md` - This file, tracking local changes
- `examples/moltbot.proportione.json5` - Example configuration

**Files Modified:**
- `.env.example` - Expanded with all channel credentials template

**Extensions Added:**
- `extensions/feria-mode/` - Offline queue mode for intermittent connectivity

## Upstream Sync Strategy

### Before Syncing

1. Review this file for potential conflicts
2. Commit or stash local changes
3. Create backup branch: `git branch backup-$(date +%Y%m%d)`

### Sync Process

```bash
git fetch upstream
git checkout main
git merge upstream/main
# Resolve conflicts, prioritizing upstream for core files
git checkout feature/proportione-customizations
git rebase main
```

### Conflict Resolution Guidelines

| File/Path | Strategy |
|-----------|----------|
| `src/*` | Accept upstream, re-apply local patches |
| `extensions/*` | Keep local extensions, accept upstream for existing |
| `docs/*` | Accept upstream |
| `package.json` | Accept upstream, verify local deps still work |
| `.env.example` | Merge manually, keep local additions |
| `BUILD_NOTES.md` | Keep local |
| `CUSTOMIZATIONS.md` | Keep local |
| `examples/*` | Keep local |

## Extension Plans

### Phase 1: Feria Mode (Offline Queue)
- Location: `extensions/feria-mode/`
- Purpose: Queue messages when offline, sync when reconnected
- Status: **Implemented** - SQLite queue with connectivity monitoring

### Phase 3: Google Workspace
- Location: `extensions/google-workspace/`
- Purpose: Calendar and Gmail integration
- Status: Planned

## Configuration Philosophy

1. **Prefer configuration over code changes**
   - Use `~/.clawdbot/moltbot.json` for all customizations
   - Avoid modifying `src/` files

2. **Use plugins for new functionality**
   - Create extensions in `extensions/` directory
   - Follow existing plugin patterns

3. **Contribute generic fixes upstream**
   - If a fix benefits everyone, submit PR to upstream
   - Keep fork-specific changes isolated

## Contact

For questions about this fork, contact the Proportione development team.
