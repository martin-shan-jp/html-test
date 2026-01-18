/**
 * Cocos Creator 3.8.4 预制体解析器
 * 将 .prefab 文件解析为节点树结构
 */
const fs = require('fs');
const path = require('path');

class CocosPrefabParser {
    constructor(prefabData) {
        this.prefabData = typeof prefabData === 'string' ? JSON.parse(prefabData) : prefabData;
        this.nodeMap = new Map();
        this.componentMap = new Map();
    }

    /**
     * 解析预制体数据
     */
    parse() {
        if (!this.prefabData || !Array.isArray(this.prefabData)) {
            throw new Error('Invalid prefab data format');
        }

        // 第一步：构建节点和组件的映射
        this.buildMaps();

        // 第二步：找到根节点
        const rootNode = this.findRootNode();

        if (!rootNode) {
            throw new Error('Root node not found');
        }

        // 第三步：构建树结构
        return this.buildNodeTree(rootNode);
    }

    /**
     * 构建节点和组件的映射表
     */
    buildMaps() {
        this.prefabData.forEach((item, index) => {
            if (!item) return;

            const type = item.__type__;

            if (type === 'cc.Node') {
                this.nodeMap.set(index, item);
            } else if (type && type.startsWith('cc.')) {
                // 组件类型
                this.componentMap.set(index, item);
            }
        });
    }

    /**
     * 查找根节点（没有父节点的节点）
     */
    findRootNode() {
        for (const [index, node] of this.nodeMap) {
            if (!node._parent || node._parent.__id__ === undefined) {
                return { index, node };
            }
        }
        return null;
    }

    /**
     * 构建节点树
     */
    buildNodeTree(rootNodeInfo) {
        const result = {};
        const nodeName = rootNodeInfo.node._name || 'Root';

        result[nodeName] = this.parseNode(rootNodeInfo.index, rootNodeInfo.node);

        return result;
    }

    /**
     * 解析单个节点
     */
    parseNode(nodeIndex, nodeData) {
        const nodeInfo = {
            components: {},
            children: {},
            __nodeId__: nodeIndex
        };

        // 解析组件
        if (nodeData._components && Array.isArray(nodeData._components)) {
            nodeData._components.forEach((compRef) => {
                if (compRef && compRef.__id__ !== undefined) {
                    const compId = compRef.__id__;
                    const component = this.prefabData[compRef.__id__];
                    if (component && component.__type__) {
                        const compType = component.__type__.replace('cc.', '');
                        nodeInfo.components[compType] = this.parseComponent(component);
                        nodeInfo.components[compType].__compId__ = compId;
                    }
                }
            });
        }

        // 解析子节点
        if (nodeData._children && Array.isArray(nodeData._children)) {
            nodeData._children.forEach((childRef) => {
                if (childRef && childRef.__id__ !== undefined) {
                    const childNode = this.prefabData[childRef.__id__];
                    if (childNode && childNode.__type__ === 'cc.Node') {
                        const childName = childNode._name || `Node_${childRef.__id__}`;
                        nodeInfo.children[childName] = this.parseNode(childRef.__id__, childNode);
                    }
                }
            });
        }

        // 添加节点基本属性
        if (nodeData._active !== undefined) {
            nodeInfo.active = nodeData._active;
        }
        if (nodeData._lpos) {
            nodeInfo.position = this.parseVector3(nodeData._lpos);
        }
        if (nodeData._lrot) {
            nodeInfo.rotation = this.parseQuaternion(nodeData._lrot);
        }
        if (nodeData._euler) {
            nodeInfo.euler = this.parseVector3(nodeData._euler);
        }
        if (nodeData._lscale) {
            nodeInfo.scale = this.parseVector3(nodeData._lscale);
        }

        return nodeInfo;
    }

    /**
     * 解析组件数据
     */
    parseComponent(component) {
        const result = {};

        for (const key in component) {
            if (key !== '__type__') {
                // const cleanKey = key.substring(1);
                const cleanKey = key;
                const value = component[key];

                if (value && typeof value === 'object' && value.__id__ !== undefined) {
                    // 引用类型，解析引用
                    result[cleanKey] = this.resolveReference(value.__id__);
                } else {
                    result[cleanKey] = value;
                }
            }
        }

        return result;
    }

    /**
     * 解析引用
     */
    resolveReference(refId) {
        const refData = this.prefabData[refId];
        if (!refData) {
            return { __ref__: refId };
        }

        if (refData.__type__) {
            return { __type__: refData.__type__, __ref__: refId };
        }

        return refData;
    }

    /**
     * 解析 Vector3
     */
    parseVector3(data) {
        if (!data) return null;
        return {
            x: data.x || 0,
            y: data.y || 0,
            z: data.z || 0
        };
    }

    /**
     * 解析 Quaternion
     */
    parseQuaternion(data) {
        if (!data) return null;
        return {
            x: data.x || 0,
            y: data.y || 0,
            z: data.z || 0,
            w: data.w !== undefined ? data.w : 1
        };
    }
}

// 使用示例
function parsePrefab(prefabContent) {
    try {
        const parser = new CocosPrefabParser(prefabContent);
        const tree = parser.parse();
        return tree;
    } catch (error) {
        console.error('Parse error:', error);
        return null;
    }
}

// 如果是 Node.js 环境
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CocosPrefabParser, parsePrefab };
}

// 或者直接传入预制体数据
// const v3Prefab = JSON.parse(fs.readFileSync("./assets/test2.prefab3", "utf8"));
// const tree = parsePrefab(v3Prefab);
// fs.writeFileSync("./test.json", JSON.stringify(tree, null, 2));
// console.log(JSON.stringify(tree,null,2));
// console.log(tree);
