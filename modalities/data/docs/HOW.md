# modality:data — attention-packed durable store

Child of **host**. Holds cold/hot structured world data under **attention-live-v1**.

## Law
- Densest first when reading any page.  
- Bytes count toward host pressure.  
- Empty exports/store at boot (fresh start).  
- Grok authors content objects here; host ranks this modality when host’s goal needs durable memory.

## Together / separate
- **Together:** host Best may enter data to persist findings.  
- **Separate:** data’s **child jgroup** ranked under data’s goals with layer-local j:

```
data
 ├── pages     (store/pages densest + craft soft-cap)
 ├── exports   (store/exports index)
 └── samples  (effectiveness_samples.jsonl trim)
```

Rank with `living_rank_cycle` parent=`data`.

## Exotelos
See `docs/EXOTELOS.md` · tertiary exogenous intention · [[exotelos_law]].
