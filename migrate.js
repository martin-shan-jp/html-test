#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { parsePrefab } = require("./parserv3");
const { buildNormalizedScriptMap, isUUID } = require("./util");
const { generateUuidMapping } = require("./parser_resource");

/* ======================================================
 * 配置区域
 * ====================================================== */

/**
 * 组件转换规则配置
 */
const COMPONENT_TRANSFORM_RULES = {
  UIOpacity: [
    {
      target: "Node",
      fieldMap: {
        _opacity: "_opacity",
      },
    },
  ],
  UITransform: [
    {
      target: "Node",
      fieldMap: {
        _anchorPoint: "_anchorPoint",
        _contentSize: "_contentSize",
      },
    },
  ],
  Label: [
    {
      target: "Node",
      fieldMap: {
        _color: "_color",
      },
    },
    {
      target: "Label",
      fieldMap: {
        _verticalAlign: "_N$verticalAlign",
        _horizontalAlign: "_N$horizontalAlign",
        _fontFamily: "_N$fontFamily",
        _overflow: "_N$overflow",
        _cacheMode: "_N$cacheMode",
        _string: "_N$string",
        _font: "_N$file",
      },
    },
  ],

  Sprite:[ {
      target: "Node",
      fieldMap: {
        _color: "_color",
      },
    },
  ],

  Button: [
    {
      target: "Button",
      fieldMap: {
        _transition: ["_N$transition", "transition"],
        _interactable: "_N$interactable",
        _normalColor: "_N$normalColor",
        _target: "_N$target",
        _duration: "duration",
        _zoomScale: "zoomScale",
        _hoverColor: ["_N$hoverColor", "hoverColor"],
        _pressedColor: ["_N$pressedColor", "pressedColor"],
        _disabledColor: ["_N$disabledColor", "disabledColor"],
        _normalSprite: ["_N$normalSprite", "normalSprite"],
        _hoverSprite: ["_N$hoverSprite", "hoverSprite"],
        _pressedSprite: ["_N$pressedSprite", "pressedSprite"],
        _disabledSprite: ["_N$disabledSprite", "disabledSprite"],
      },
    },
  ],
};

/**
 * Script UUID 映射表
 * key / value 均可为长 uuid 或短 uuid
 */
const SCRIPT_UUID_MAP = {
  // bordergraphic
  "25f8fxwtsZCT7yF0lzyt5zU": { target: "8bab7e0c-0380-491c-b66f-b2bef75657c2" },
  // i8ntext
  "08e1e8nYqFCd7dX6KiiPt2N": { target: "0657750f-91c5-4c19-9bfb-6c10d21f4687" },
  // CountDownButton
  "7d729a50-deea-4c4b-8e3a-d1159eb9a33a": { target: "a42b0a21-b23f-45bf-87b2-92143c8781da" },
};
const NORMALIZED_SCRIPT_UUID_MAP = buildNormalizedScriptMap(SCRIPT_UUID_MAP);

/**
 * 需要移除的组件列表
 */
const COMPONENTS_TO_REMOVE = ["UIOpacity", "UITransform"];

/**
 * 字段迁移白名单(可选)
 */
const FIELD_WHITELIST = {
  // 'Sprite': ['spriteFrame', 'type', 'sizeMode'],
};

/* ======================================================
 * CLI 参数解析
 * ====================================================== */

function parseArgs() {
  const args = process.argv.slice(2);
  const map = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      // 处理布尔标志
      if (key === "overwrite" || key === "recursive") {
        map[key] = true;
      } else {
        map[key] = args[i + 1];
        i++;
      }
    }
  }

  if (!map.v3 || !map.v2) {
    console.error(`
Usage:
  单文件模式:
    node migrate.js --v3 source_v3.prefab --v2 target_v2.prefab [--out output.prefab] [--overwrite]
  
  文件夹模式:
    node migrate.js --v3 source_v3_dir --v2 target_v2_dir [--out output_dir] [--overwrite] [--recursive]

参数说明:
  --v3          V3 版本的源文件或文件夹
  --v2          V2 版本的目标文件或文件夹
  --out         输出文件或文件夹 (可选，默认在 v2 同级目录创建 migrated 文件夹)
  --overwrite   覆盖目标文件 (如果指定，将直接修改 v2 文件)
  --recursive   递归处理子文件夹 (仅文件夹模式)
`);
    process.exit(1);
  }

  return map;
}

/* ======================================================
 * 文件/文件夹处理工具
 * ====================================================== */

/**
 * 判断路径是否为目录
 */
function isDirectory(path) {
  try {
    return fs.statSync(path).isDirectory();
  } catch (e) {
    return false;
  }
}

/**
 * 递归获取目录下所有 .prefab 文件
 */
function getAllPrefabFiles(dir, recursive = false) {
  const files = [];

  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);

    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory() && recursive) {
        traverse(fullPath);
      } else if (stat.isFile() && item.endsWith(".prefab")) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

/**
 * 获取相对路径
 */
function getRelativePath(from, to) {
  return path.relative(from, to);
}

/**
 * 确保目录存在
 */
function ensureDirectoryExists(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

/* ======================================================
 * 树路径匹配
 * ====================================================== */

/**
 * 构建从根到每个节点的路径映射
 * 返回: { 'path/to/node': treeNode }
 */
function buildPathMap(tree, prefix = "") {
  const pathMap = {};

  function traverse(node, path) {
    pathMap[path] = node;

    if (node.children) {
      for (const [childName, childNode] of Object.entries(node.children)) {
        const childPath = path ? `${path}/${childName}` : childName;
        traverse(childNode, childPath);
      }
    }
  }

  for (const [rootName, rootNode] of Object.entries(tree)) {
    traverse(rootNode, rootName);
  }
  return pathMap;
}

/* ======================================================
 * 字段迁移逻辑
 * ====================================================== */

function shouldMigrateField(compType, fieldName) {
  if (
    fieldName === "node" ||
    fieldName === "__compId__" ||
    fieldName === "__ref__"
  ) {
    return false;
  }

  if (FIELD_WHITELIST[compType]) {
    return FIELD_WHITELIST[compType].includes(fieldName);
  }

  return true;
}

/**
 * 生成迁移指令
 */
function generateMigrationInstructions(v3PathMap, v2PathMap) {
  const instructions = [];

  console.log("\n🔍 匹配节点...\n");
  for (const [nodePath, v3Node] of Object.entries(v3PathMap)) {
    const v2Node = v2PathMap[nodePath];

    if (!v2Node) {
      console.log(`⚠️  跳过节点(v2 中不存在): ${nodePath}`);
      continue;
    }

    console.log(`📦 匹配节点: ${nodePath}`);
    console.log(
      `   V3 Node ID: ${v3Node.__nodeId__} → V2 Node ID: ${v2Node.__nodeId__}`
    );

    // 遍历 v3 的组件
    for (const [compType, v3Comp] of Object.entries(v3Node.components)) {
      // 检查转换规则
      const transformRules = COMPONENT_TRANSFORM_RULES[compType];
      if (transformRules) {
        // 遍历所有转换规则
        for (const transformRule of transformRules) {
          if (transformRule.target === "Node") {
            // 转换到 Node 属性
            for (const [v3Field, v2Field] of Object.entries(
              transformRule.fieldMap
            )) {
              const value = v3Comp[v3Field];
              if (value !== undefined && value !== null) {
                // ★ 修改点 1：统一处理 string | string[]
                const targets = Array.isArray(v2Field) ? v2Field : [v2Field];

                for (const field of targets) {
                  instructions.push({
                    type: "TRANSFORM_TO_NODE",
                    targetNodeId: v2Node.__nodeId__,
                    field: `${field}`,
                    value: value,
                    source: `${compType}.${v3Field}`,
                  });
                  console.log(
                    `  🔄 转换: ${compType}.${v3Field} → Node.${field}`
                  );
                }
              }
            }
          } else {
            // 转换到其他组件
            const v2TargetComp = v2Node.components[transformRule.target];
            if (v2TargetComp) {
              for (const [v3Field, v2Field] of Object.entries(
                transformRule.fieldMap
              )) {
                const value = v3Comp[v3Field];
                if (value !== undefined && value !== null) {
                  // ★ 修改点 2：统一处理 string | string[]
                  const targets = Array.isArray(v2Field) ? v2Field : [v2Field];
                  let v = value;
                  if (value.__type__ && value.__ref__) {
                    v = {
                      __id__: value.__ref__,
                    };
                  }
                  for (const field of targets) {
                    instructions.push({
                      type: "TRANSFORM_TO_COMPONENT",
                      targetCompId: v2TargetComp.__compId__,
                      field: `${field}`,
                      value: v,
                      source: `${compType}.${v3Field}`,
                    });
                    console.log(
                      `  🔄 转换: ${compType}.${v3Field} → ${transformRule.target}.${field}`
                    );
                  }
                }
              }
            }
          }
        }
      }

      // 常规组件字段迁移
      const v2Comp = v2Node.components[compType];
      if (!v2Comp) {
        console.log(`  ⚠️  跳过组件(v2 中不存在): ${compType}`);
        continue;
      }

      // 收集需要迁移的字段
      const fieldsToMigrate = [];
      for (const fieldName in v3Comp) {
        const value = v3Comp[fieldName];
        const value2 = v2Comp[fieldName];
        if (value === null || value === undefined || value2 === undefined) {
          continue;
        }
        let v = value;
        if (value.__type__ && value.__ref__) {
          // refid 节点数据不要变
          continue;
        }
        if (shouldMigrateField(compType, fieldName)) {
          fieldsToMigrate.push({
            field: `${fieldName}`,
            value: v,
          });
        }
      }

      if (fieldsToMigrate.length > 0) {
        instructions.push({
          type: "MIGRATE_COMPONENT",
          targetCompId: v2Comp.__compId__,
          componentType: compType,
          fields: fieldsToMigrate,
        });
        console.log(
          `  ✔ 迁移: ${compType} (${fieldsToMigrate.length} 个字段)`
        );
      }
    }
  }

  return instructions;
}

/**
 * 生成组件删除指令
 */
function generateRemovalInstructions(v2PathMap, v2PrefabData) {
  const removalInstructions = [];
  console.log("\n🗑️  查找需要删除的组件...\n");

  for (const [nodePath, v2Node] of Object.entries(v2PathMap)) {
    // 遍历节点的所有组件
    for (const [compType, v2Comp] of Object.entries(v2Node.components)) {
      // 检查是否在删除列表中
      if (COMPONENTS_TO_REMOVE.includes(compType)) {
        // 找到该组件在 v2PrefabData 中对应的 Node
        const nodeData = v2PrefabData[v2Node.__nodeId__];
        if (nodeData && nodeData._components) {
          // 查找组件引用的索引
          const compIndex = nodeData._components.findIndex(
            (ref) => ref.__id__ === v2Comp.__compId__
          );

          if (compIndex !== -1) {
            removalInstructions.push({
              type: "REMOVE_COMPONENT",
              nodeId: v2Node.__nodeId__,
              compId: v2Comp.__compId__,
              compType: compType,
              compIndex: compIndex,
              nodePath: nodePath,
            });
            console.log(
              `  🗑️  标记删除: ${nodePath} -> ${compType}[${v2Comp.__compId__}]`
            );
          }
        }
      }
    }
  }

  return removalInstructions;
}

/**
 * 生成 Script 组件类型映射指令
 */
function generateScriptReplacementInstructions(v3PathMap, v2PathMap) {
  const instructions = [];

  console.log("\n🔧 处理 Script 组件类型替换...\n");

  for (const [nodePath, v3Node] of Object.entries(v3PathMap)) {
    const v2Node = v2PathMap[nodePath];
    if (!v2Node) continue;

    // 遍历 v3 的所有组件
    for (const [v3CompType, v3Comp] of Object.entries(v3Node.components)) {
      // 检查该组件类型是否在映射表中
      const mappingRule = NORMALIZED_SCRIPT_UUID_MAP[v3CompType];
      if (!mappingRule) {
        continue; // 没有映射规则，跳过
      }

      const v2CompType = mappingRule.target;

      // 在 v2 中查找原 v3CompType 的组件（需要被替换的组件）
      const v2CompToReplace = v2Node.components[v3CompType];
      if (!v2CompToReplace) {
        console.log(
          `  ⚠️  V2 中不存在需要替换的组件: ${nodePath} -> ${v3CompType}`
        );
        continue;
      }

      console.log(
        `  🔄 组件类型替换: ${nodePath} -> ${v3CompType} ⇒ ${v2CompType}`
      );

      // 准备要迁移的字段数据
      const fieldsToMigrate = {};

      if (mappingRule.fieldMap) {
        // 有字段映射规则：按映射转换
        for (const [v3Field, v2Field] of Object.entries(mappingRule.fieldMap)) {
          const value = v3Comp[v3Field];
          if (value !== undefined && value !== null) {
            fieldsToMigrate[v2Field] = value;
            console.log(`    🔍 字段映射: ${v3Field} → ${v2Field}`);
          }
        }
      } else {
        // 无字段映射规则：直接迁移所有字段
        for (const fieldName in v3Comp) {
          const value = v3Comp[fieldName];
          if (value === null || value === undefined) {
            continue;
          }

          if (shouldMigrateField(v3CompType, fieldName)) {
            fieldsToMigrate[fieldName] = value;
          }
        }
        console.log(
          `    ✔ 迁移所有字段 (${Object.keys(fieldsToMigrate).length} 个)`
        );
      }

      // 生成替换指令
      instructions.push({
        type: "REPLACE_COMPONENT_TYPE",
        nodeId: v2Node.__nodeId__,
        nodePath: nodePath,
        oldCompId: v2CompToReplace.__compId__,
        oldCompType: v3CompType,
        newCompType: v2CompType,
        fieldsToMigrate: fieldsToMigrate,
      });
    }
  }

  return instructions;
}

function generateGlobalStringReplaceInstructions() {

    const v3Data = JSON.parse(fs.readFileSync('./tools/migrate/3.8.4_internal-data.json', 'utf8'));
    const v2Data = JSON.parse(fs.readFileSync('./tools/migrate/2.4.13_uuid-to-mtime.json', 'utf8'));
        const { mapping, unmatched } = generateUuidMapping(v3Data, v2Data);

const res =[ ]
    // 生成映射
   Object.keys(mapping).forEach((key)=>{
    res.push({
      type: "REPLACE_STRING_GLOBAL",
      from: key,
      to: mapping[key].v2Uuid,
    })
   })
// 排序：带 @ 的排在前面
res.sort((a, b) => {
  const aHasAt = a.from.includes('@');
  const bHasAt = b.from.includes('@');
  
  // 如果 a 有 @，b 没有，a 排前面
  if (aHasAt && !bHasAt) return -1;
  // 如果 b 有 @，a 没有，b 排前面
  if (!aHasAt && bHasAt) return 1;
  // 都有或都没有，保持原顺序（或按字母顺序）
  return 0;
})
   res.push({
      type: "REPLACE_STRING_GLOBAL",
      from: "@f9941",
      to: "@6c48a",
   })
 return res
}

/* ======================================================
 * 应用迁移指令
 * ====================================================== */

function applyMigrationInstructions(v2PrefabData, instructions) {
  let appliedCount = 0;

  console.log("\n🔧 应用迁移指令...\n");

  for (const instruction of instructions) {
    switch (instruction.type) {
      case "TRANSFORM_TO_NODE":
        {
          const node = v2PrefabData[instruction.targetNodeId];
          if (node && node.__type__ === "cc.Node") {
            node[instruction.field] = instruction.value;
            console.log(
              `  ✔ ${instruction.source} → Node[${instruction.targetNodeId}].${instruction.field} = ${instruction.value}`
            );
            appliedCount++;
          }
        }
        break;

      case "TRANSFORM_TO_COMPONENT":
        {
          const comp = v2PrefabData[instruction.targetCompId];
          if (comp) {
            comp[instruction.field] = instruction.value;
            console.log(
              `  ✔ ${instruction.source} → Component[${instruction.targetCompId}].${instruction.field}`
            );
            appliedCount++;
          }
        }
        break;

      case "MIGRATE_COMPONENT":
        {
          const comp = v2PrefabData[instruction.targetCompId];
          if (comp) {
            for (const { field, value } of instruction.fields) {
              comp[field] = value;
            }
            console.log(
              `  ✔ ${instruction.componentType}[${instruction.targetCompId}] 迁移 ${instruction.fields.length} 个字段`
            );
            appliedCount++;
          }
        }
        break;
    }
  }

  console.log(`\n✅ 应用了 ${appliedCount} 条指令\n`);
  return v2PrefabData;
}

/**
 * 应用组件删除指令
 */
function applyRemovalInstructions(v2PrefabData, removalInstructions) {
  let removedCount = 0;

  console.log("\n🗑️  应用组件删除指令...\n");

  // 按 compIndex 降序排序,避免删除时索引错位
  const sortedInstructions = [...removalInstructions].sort(
    (a, b) => b.compIndex - a.compIndex
  );

  for (const instruction of sortedInstructions) {
    const node = v2PrefabData[instruction.nodeId];
    const comp = v2PrefabData[instruction.compId];

    if (node && node._components) {
      // 从 Node 的 _components 数组中移除该组件引用
      if (
        instruction.compIndex >= 0 &&
        instruction.compIndex < node._components.length
      ) {
        node._components.splice(instruction.compIndex, 1);
        console.log(
          `  ✔ 从 Node._components 移除: ${instruction.nodePath} -> ${instruction.compType} (索引 ${instruction.compIndex})`
        );
      }

      // 从 v2PrefabData 中删除该组件对象
      if (comp) {
        delete v2PrefabData[instruction.compId];
        console.log(
          `  ✔ 删除组件对象: ${instruction.compType}[${instruction.compId}]`
        );
        removedCount++;
      }
    } else {
      console.log(
        `  ⚠️  删除失败: ${instruction.nodePath} -> ${instruction.compType}[${instruction.compId}]`
      );
    }
  }

  console.log(`\n✅ 删除了 ${removedCount} 个组件\n`);
  // 清理 null 元素并重建所有 __id__ 引用
  return compactAndReindexPrefab(v2PrefabData);
}

function applyStringReplaceInstructions(prefabData, instructions) {
  console.log("\n🔤 应用字符串替换指令...\n");

  function replaceString(str, from, to) {
    if (from instanceof RegExp) {
      return str.replace(from, to);
    }
    if(str.includes(from))
    console.log(`xxxxxxxxxx str=${str} from=${from} to=${to} result=${str.includes(from) ? str.split(from).join(to) : str}`)
    return str.includes(from) ? str.split(from).join(to) : str;
  }

  function traverse(obj, from, to) {
    if (!obj) return;

    if (typeof obj === "string") {
      return replaceString(obj, from, to);
    }

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const v = obj[i];
        if (typeof v === "string") {
          obj[i] = replaceString(v, from, to);
        } else {
          traverse(v, from, to);
        }
      }
      return;
    }

    if (typeof obj === "object") {
      for (const key of Object.keys(obj)) {
        const v = obj[key];
        if (typeof v === "string") {
          obj[key] = replaceString(v, from, to);
        } else {
          traverse(v, from, to);
        }
      }
    }
  }

  for (const ins of instructions) {
    if (ins.type !== "REPLACE_STRING_GLOBAL") continue;

    console.log(`  🔁 "${ins.from}" → "${ins.to}"`);

    for (const item of prefabData) {
      traverse(item, ins.from, ins.to);
    }
  }

  console.log("\n✅ 字符串替换完成\n");
  return prefabData;
}

/**
 * 重新整理 prefab 数据的 __id__
 * 删除空元素并重建所有引用
 */
function compactAndReindexPrefab(prefabData) {
  console.log("\n🔄 开始重新整理 __id__...\n");
  // 1. 建立旧索引到新索引的映射
  const oldToNewIdMap = new Map();
  let newIndex = 0;

  for (let oldIndex = 0; oldIndex < prefabData.length; oldIndex++) {
    const item = prefabData[oldIndex];
    if (item !== null && item !== undefined) {
      oldToNewIdMap.set(oldIndex, newIndex);
      newIndex++;
    }
  }

  console.log(`  📊 索引映射: ${prefabData.length} -> ${newIndex} 个元素`);

  // 2. 创建紧凑的新数组
  const compactedData = prefabData;

  for (let i = compactedData.length - 1; i >= 0; i--) {
    if (compactedData[i] === null || compactedData[i] === undefined) {
      compactedData.splice(i, 1);
    }
  }

  // 3. 递归更新所有 __id__ 引用
  function updateReferences(obj) {
    if (obj === null || obj === undefined) {
      return;
    }

    if (Array.isArray(obj)) {
      // 处理数组
      obj.forEach((item) => updateReferences(item));
    } else if (typeof obj === "object") {
      // 处理对象
      if (obj.hasOwnProperty("__id__")) {
        // 这是一个引用对象,更新其 __id__
        const oldId = obj.__id__;
        const newId = oldToNewIdMap.get(oldId);

        if (newId !== undefined) {
          obj.__id__ = newId;
        } else {
          console.warn(`  ⚠️  无效的引用: __id__ = ${oldId}`);
        }
      }

      // 递归处理对象的所有属性
      for (const key in obj) {
        if (obj.hasOwnProperty(key) && key !== "__id__") {
          updateReferences(obj[key]);
        }
      }
    }
  }

  // 更新所有元素中的引用
  compactedData.forEach((item, index) => {
    updateReferences(item);
  });

  console.log(`\n✅ __id__ 重新整理完成\n`);

  return compactedData;
}

/**
 * 应用组件类型替换指令
 */
function applyScriptReplacementInstructions(v2PrefabData, instructions) {
  let appliedCount = 0;

  console.log("\n🔧 应用 Script 组件类型替换...\n");

  for (const instruction of instructions) {
    const node = v2PrefabData[instruction.nodeId];
    const oldComp = v2PrefabData[instruction.oldCompId];

    if (!node || !oldComp) {
      console.log(
        `  ⚠️  找不到节点或组件: ${instruction.nodePath} -> ${instruction.oldCompType}`
      );
      continue;
    }

    // 1. 修改组件的 __type__ 字段
    if (oldComp.__type__) {
      console.log(
        `    🔄 替换 __type__: ${oldComp.__type__} → ${instruction.newCompType}`
      );
      oldComp.__type__ = `${instruction.newCompType}`;
    }

    // 2. 应用字段迁移
    for (const [fieldName, value] of Object.entries(
      instruction.fieldsToMigrate
    )) {
      oldComp[fieldName] = value;
    }

    console.log(
      `  ✔ ${instruction.nodePath}: ${instruction.oldCompType} ⇒ ${
        instruction.newCompType
      } (${Object.keys(instruction.fieldsToMigrate).length} 个字段)`
    );
    appliedCount++;
  }

  console.log(`\n✅ 应用了 ${appliedCount} 条组件类型替换指令\n`);
  return compactAndReindexPrefab(v2PrefabData);
}

/* ======================================================
 * 主迁移流程
 * ====================================================== */

function migratePrefab(v3PrefabData, v2PrefabData) {
  console.log("\n🌳 解析树结构...");

  // 1. 使用 parsePrefab 解析,保留 __id__ 信息
  const v3Tree = parsePrefab(v3PrefabData);
  const v2Tree = parsePrefab(v2PrefabData);

  const v3PathMap = buildPathMap(v3Tree);
  const v2PathMap = buildPathMap(v2Tree);

  // 2. 基于树结构生成迁移指令
  const instructions = generateMigrationInstructions(v3PathMap, v2PathMap);
  console.log(`生成了 ${instructions.length} 条迁移指令`);

  // 3. 生成 Script UUID 迁移指令（新增）
  const scriptInstructions = generateScriptReplacementInstructions(
    v3PathMap,
    v2PathMap
  );
  console.log(`生成了 ${scriptInstructions.length} 条 Script 迁移指令`);

  // 4. 应用指令到原始 v2 prefab 数据
  let result = applyMigrationInstructions(v2PrefabData, instructions);

  // 5. 应用组件类型替换指令
  result = applyScriptReplacementInstructions(result, scriptInstructions);

  // 6. 生成组件删除指令
  const removalInstructions = generateRemovalInstructions(v2PathMap, result);
  console.log(`生成了 ${removalInstructions.length} 条删除指令`);

  // 7. 应用删除指令
  result = applyRemovalInstructions(result, removalInstructions);

  // 8. 全局进行字符串替换
  const stringReplaceInstructions = generateGlobalStringReplaceInstructions();
  result = applyStringReplaceInstructions(result, stringReplaceInstructions);

  return result;
}

/**
 * 处理单个文件迁移
 */
function migrateFile(v3Path, v2Path, outputPath, overwrite) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📄 处理文件: ${path.basename(v3Path)}`);
  console.log(`${"=".repeat(80)}`);

  const v3Prefab = JSON.parse(fs.readFileSync(v3Path, "utf8"));
  const v2Prefab = JSON.parse(fs.readFileSync(v2Path, "utf8"));

  const result = migratePrefab(v3Prefab, v2Prefab);

  const finalOutput = overwrite ? v2Path : outputPath;
  ensureDirectoryExists(finalOutput);
  fs.writeFileSync(finalOutput, JSON.stringify(result, null, 2));

  console.log(`💾 输出文件: ${path.resolve(finalOutput)}`);
  console.log(`${overwrite ? "⚠️  已覆盖原文件" : "✅ 已保存到新文件"}`);
}

/**
 * 处理文件夹迁移
 */
function migrateDirectory(v3Dir, v2Dir, outputDir, overwrite, recursive) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📁 处理文件夹: ${v3Dir}`);
  console.log(`${"=".repeat(80)}`);
  console.log(`递归模式: ${recursive ? "是" : "否"}`);
  console.log(`覆盖模式: ${overwrite ? "是" : "否"}`);

  const v3Files = getAllPrefabFiles(v3Dir, recursive);
  console.log(`\n找到 ${v3Files.length} 个 .prefab 文件\n`);

  let successCount = 0;
  let failCount = 0;

  for (const v3File of v3Files) {
    try {
      const relativePath = getRelativePath(v3Dir, v3File);
      const v2File = path.join(v2Dir, relativePath);

      if (!fs.existsSync(v2File)) {
        console.log(`⚠️  跳过: ${relativePath} (V2 文件不存在)`);
        failCount++;
        continue;
      }

      const outputFile = overwrite
        ? v2File
        : path.join(outputDir, relativePath);

      migrateFile(v3File, v2File, outputFile, overwrite);
      successCount++;
    } catch (error) {
      console.error(`❌ 处理失败: ${v3File}`);
      console.error(`   错误: ${error.message}`);
      failCount++;
    }
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 迁移统计:`);
  console.log(`   成功: ${successCount} 个文件`);
  console.log(`   失败: ${failCount} 个文件`);
  console.log(`${"=".repeat(80)}`);
}

/* ======================================================
 * CLI 入口
 * ====================================================== */

(function main() {
  const args = parseArgs();

  const v3IsDir = isDirectory(args.v3);
  const v2IsDir = isDirectory(args.v2);

  // 验证输入
  if (v3IsDir !== v2IsDir) {
    console.error("❌ 错误: --v3 和 --v2 必须同时为文件或同时为文件夹");
    process.exit(1);
  }

  if (v3IsDir) {
    // 文件夹模式
    const outputDir = args.out || path.join(path.dirname(args.v2), "migrated");

    if (!args.overwrite && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    migrateDirectory(
      args.v3,
      args.v2,
      outputDir,
      args.overwrite,
      args.recursive
    );
  } else {
    // 单文件模式
    if (!fs.existsSync(args.v3)) {
      console.error(`❌ 错误: V3 文件不存在: ${args.v3}`);
      process.exit(1);
    }

    if (!fs.existsSync(args.v2)) {
      console.error(`❌ 错误: V2 文件不存在: ${args.v2}`);
      process.exit(1);
    }

    const outputPath =
      args.out ||
      path.join(path.dirname(args.v2), "migrated_" + path.basename(args.v2));

    migrateFile(args.v3, args.v2, outputPath, args.overwrite);
  }

  console.log("\n🎉 迁移完成!");
})();
