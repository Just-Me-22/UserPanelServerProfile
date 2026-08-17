/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { GuildMemberStore, SelectedGuildStore, UserStore } from "@webpack/common";

const VAR = "--np-plate";
const ASSETS = "https://cdn.discordapp.com/assets/collectibles/";
const SIZE = 32;

const logger = new Logger("UserPanelServerProfile");
const inks = new Map<string, string>();

let current: string | null = null;
let stores: any[] = [];

function activeAsset() {
    const user = UserStore.getCurrentUser();
    if (!user) return null;

    const guildId = SelectedGuildStore.getGuildId();
    const member = guildId ? GuildMemberStore.getMember(guildId, user.id) as any : null;

    return (member?.collectibles?.nameplate ?? (user as any).collectibles?.nameplate)?.asset ?? null;
}

function toHex(r: number, g: number, b: number) {
    const lift = Math.max(1, 150 / Math.max(r, g, b));
    const channel = (n: number) => Math.min(255, Math.round(n * lift)).toString(16).padStart(2, "0");
    return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function dominant(data: Uint8ClampedArray) {
    let r = 0, g = 0, b = 0, total = 0;

    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;
        if (alpha < 0.5) continue;

        const [red, green, blue] = [data[i], data[i + 1], data[i + 2]];
        const max = Math.max(red, green, blue);
        const saturation = max === 0 ? 0 : (max - Math.min(red, green, blue)) / max;
        if (max < 40 || saturation < 0.15) continue;

        const weight = saturation * saturation * alpha;
        r += red * weight;
        g += green * weight;
        b += blue * weight;
        total += weight;
    }

    return total === 0 ? null : toHex(r / total, g / total, b / total);
}

function read(url: string) {
    return new Promise<string | null>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";

        image.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = SIZE;

            const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(image, 0, 0, SIZE, SIZE);
            resolve(dominant(ctx.getImageData(0, 0, SIZE, SIZE).data));
        };
        image.onerror = () => reject(new Error(`could not load ${url}`));

        image.src = url;
    });
}

async function apply() {
    const asset = activeAsset();
    if (asset === current) return;
    current = asset;

    if (!asset) return document.body.style.removeProperty(VAR);

    const known = inks.get(asset);
    if (known) return document.body.style.setProperty(VAR, known);

    try {
        const ink = await read(`${ASSETS}${asset}static.png`);
        if (!ink) return;

        inks.set(asset, ink);
        if (current === asset) document.body.style.setProperty(VAR, ink);
    } catch (err) {
        logger.error("could not read the nameplate colour", err);
    }
}

export function startNameplateInk() {
    stores = [SelectedGuildStore, UserStore, GuildMemberStore];
    for (const store of stores) store.addChangeListener(apply);
    apply();
}

export function stopNameplateInk() {
    for (const store of stores) store.removeChangeListener(apply);

    stores = [];
    current = null;
    document.body.style.removeProperty(VAR);
}
