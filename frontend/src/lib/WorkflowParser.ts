/*
 * Copyright 2018-2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as JsYaml from 'js-yaml';
import MoreIcon from '@material-ui/icons/MoreHoriz';
import * as dagre from 'dagre';
import {
  NodeStatus,
  Parameter,
  S3Artifact,
  Workflow,
} from '../../third_party/argo-ui/argo_template';
import IconWithTooltip from '../atoms/IconWithTooltip';
import { color } from '../Css';
import { statusToIcon } from '../pages/Status';
import { Constants } from './Constants';
import { KeyValue } from './StaticGraphParser';
import { hasFinished, NodePhase, statusToBgColor, parseNodePhase, parseConditionPhaseFromParent } from './StatusUtils';
import { parseTaskDisplayName } from './ParserUtils';
import { isS3Endpoint } from './AwsHelper';
import { exec } from 'child_process';
import { SelectedNodeInfo, _populateInfoFromTemplate} from './StaticGraphParser';

export enum StorageService {
  GCS = 'gcs',
  HTTP = 'http',
  HTTPS = 'https',
  MINIO = 'minio',
  S3 = 's3',
}

export interface StoragePath {
  source: StorageService;
  bucket: string;
  key: string;
}

export interface Status{
  workflowNodes: {
    id: string, 
    startedAt: string, 
    finishedAt: string, 
    message: string, 
    phase: NodePhase
  }[]
}

export default class WorkflowParser {
  public static createRuntimeGraph(workflow: string, status: Status, runStatus: string): {graph: dagre.graphlib.Graph, templates: Map<string, { templateType: string; template: any }>} {
    const graph = new dagre.graphlib.Graph();
    graph.setGraph({});
    graph.setDefaultEdgeLabel(() => ({}));

    const loadedWorkflow = JsYaml.safeLoadAll(workflow);
    const templates = new Map<string, { templateType: string; template: any }>();
  
    let workflowName = loadedWorkflow[0]['metadata']['name'];
  
    // Iterate through the workflow's templates to construct a map which will be used to traverse and
    // construct the graph
    for (const template of loadedWorkflow) {
  
      if (template['kind'] == 'Task' || template['kind'] == 'Condition'){
        templates.set(template['metadata']['name'], {templateType: template['kind'], template});
      }
      else if (template['kind'] == 'Pipeline'){
        templates.set(template['metadata']['name'], {templateType: 'pipeline', template});
        workflowName = template['metadata']['name'];
      } else {
        throw new Error(
          `Unknown template kind: ${template['kind']} on workflow template: ${template['metadata']['name']}`,
        );
      }
    }

    // Create a map of task names to task for easy access to the individual tasks of the dag
    const taskMap = new Map<string, any>();
    const condMap = new Map<string, any>();
    const taskKeys : string [] = []
    for (const task of templates.get(workflowName)!['template']['spec']['tasks']) {
      taskKeys.push(task['name'])
      taskMap.set(task['name'],  task);
      for (const condition of (task['conditions'] || [])) {
        condMap.set(condition['conditionRef'], condition)
      }
    }

    // Sort between conditions and tasks
    const taskStatus : Status = {workflowNodes: []}
    const taskStatusMap = new Map<string, any>();
    const condStatus = new Map<string, any>();
    const condKeys : string[] = []
    for (const nodeStatus of status.workflowNodes){
      if (templates.get(nodeStatus.id)!.templateType === 'Task') {
        taskStatusMap.set(nodeStatus.id, nodeStatus);
        taskStatus.workflowNodes.push(nodeStatus)
      } else {
        condStatus.set(nodeStatus.id, nodeStatus)
        condKeys.push(nodeStatus.id)
      }
    }

    // Add the tasks in the workflow to the graph
    for (const nodeStatus of taskStatus.workflowNodes) {
      const taskName = nodeStatus.id;
      const task = taskMap.get(taskName);


      if (task['runAfter'])
        task['runAfter'].forEach((depTask: any)=> {
          graph.setEdge(depTask, taskName)
        });

      // Adds any dependencies that arise from Conditions and tracks these dependencies to make sure they aren't duplicated in the case that
      // the Condition and the base task use output from the same dependency
      for (const condition of (task['conditions'] || [])){
          graph.setEdge(condition['conditionRef'], taskName);
      }

      // Add the info for this node
      const info = new SelectedNodeInfo();
      _populateInfoFromTemplate(info, templates.get(taskName)!['template'])

      // Add a node for the task
      graph.setNode(nodeStatus.id, {
        height: Constants.NODE_HEIGHT,
        icon: statusToIcon(parseNodePhase(nodeStatus), nodeStatus.startedAt, nodeStatus.finishedAt, nodeStatus.message),
        info,
        label: nodeStatus.id,
        statusColoring: statusToBgColor(nodeStatus.phase as NodePhase, nodeStatus.message),
        width: Constants.NODE_WIDTH,
      });
    }

    // Add conditions
    for (const curCond of condKeys){
      const condition = condMap.get(curCond)
      const condNodeStatus = condStatus.get(curCond)
      for (const condParam of (condition['params'] || [])) {
        const conditionDep = /^(\$\(tasks\.[^.]*)/.exec(condParam['value']);  // A regex for checking if the params are being passed from another task
        if (conditionDep){
          const parentTask = conditionDep[0].substring(conditionDep[0].indexOf(".") + 1);
          graph.setEdge(parentTask, condition['conditionRef']);
      
          // Add a node for the Condition itself
          graph.setNode(condition['conditionRef'], {
            height: Constants.NODE_HEIGHT,
            icon: statusToIcon(parseConditionPhaseFromParent(condNodeStatus), condNodeStatus.startedAt, condNodeStatus.finishedAt, condNodeStatus.message),
            label: condition['conditionRef'],
            statusColoring: statusToBgColor(condNodeStatus.phase as NodePhase, condNodeStatus.message),
            width: Constants.NODE_WIDTH,
          });
        }
      }
    }

    // Add all pending tasks and conditions
    for (const taskName of taskKeys){
      const task = taskMap.get(taskName);
      let isPending = true;
      const edges : {parent: string, child: string}[] = [];

      if (!taskStatusMap.get(taskName)) {
        if (task['runAfter']) {
          task['runAfter'].forEach((depTask: any)=> {
            if (!taskStatusMap.get(depTask) || taskMap.get(depTask).phase === 'Error') {
              isPending = false;
            }
            else {
              edges.push({parent: depTask, child: taskName})
            }
          });
        }

        for (const condition of (task['conditions'] || [])){
          let condIsPending = true;
          const condEdges : {parent: string, child: string}[] = [];


          if (!condStatus.get(condition['conditionRef'])) {
            // Checks that the status for this condition exists
            for (const condParam of (condition['params'] || [])) {
              const conditionDep = /^(\$\(tasks\.[^.]*)/.exec(condParam['value']);  // A regex for checking if the params are being passed from another task
              if (conditionDep){
                const parentTask = conditionDep[0].substring(conditionDep[0].indexOf(".") + 1);
                if (!taskStatusMap.get(parentTask) || taskMap.get(parentTask).phase === 'Error') {
                  isPending = false;
                  condIsPending = false;
                } else {
                  condEdges.push({parent: parentTask, child: condition['conditionRef']})
                }
              }
              // graph.setEdge(condition['conditionRef'], taskName);
            }

            if (condIsPending) {
              isPending = false;
              for (const condEdge of (condEdges || [])){
                graph.setEdge(condEdge['parent'], condEdge['child']);
              }
              
              // Add a node for the Condition itself
              graph.setNode(condition['conditionRef'], {
                height: Constants.NODE_HEIGHT,
                icon: statusToIcon('Pending' as NodePhase),
                label: condition['conditionRef'],
                statusColoring: statusToBgColor('Pending' as NodePhase, ''),
                width: Constants.NODE_WIDTH,
              });
            }
          }
          else {
            if (condStatus.get(condition['conditionRef']).phase == 'Error'){
              isPending = false;
            }
            else {
              edges.push({parent: condition['conditionRef'], child: taskName})
            }
          }
        }
        if (isPending) {
          for (const edge of (edges || [])){
            graph.setEdge(edge['parent'], edge['child']);
          }
          
          // Add a node for the Condition itself
          graph.setNode(taskName, {
            height: Constants.NODE_HEIGHT,
            icon: statusToIcon('Pending' as NodePhase),
            label: taskName,
            statusColoring: statusToBgColor('Pending' as NodePhase, ''),
            width: Constants.NODE_WIDTH,
          });
        }
      }
    }

    return {graph, templates}
  }

  public static getParameters(workflow?: Workflow): Parameter[] {
    if (workflow && workflow.spec && workflow.spec.arguments) {
      return workflow.spec.arguments.parameters || [];
    }
    return [];
  }

  // Makes sure the workflow object contains the node and returns its
  // inputs/outputs if any, while looking out for any missing link in the chain to
  // the node's inputs/outputs.
  public static getNodeInputOutputParams(
    workflow?: Workflow,
    nodeId?: string,
  ): Record<'inputParams' | 'outputParams', Array<KeyValue<string>>> {
    type ParamList = Array<KeyValue<string>>;
    let inputParams: ParamList = [];
    let outputParams: ParamList = [];
    if (
      !nodeId ||
      !workflow ||
      !workflow.status ||
      !workflow.status.nodes ||
      !workflow.status.nodes[nodeId]
    ) {
      return { inputParams, outputParams };
    }

    const { inputs, outputs } = workflow.status.nodes[nodeId];
    if (!!inputs && !!inputs.parameters) {
      inputParams = inputs.parameters.map(p => [p.name, p.value || '']);
    }
    if (!!outputs && !!outputs.parameters) {
      outputParams = outputs.parameters.map(p => [p.name, p.value || '']);
    }
    return { inputParams, outputParams };
  }

  // Makes sure the workflow object contains the node and returns its
  // inputs/outputs artifacts if any, while looking out for any missing link in the chain to
  // the node's inputs/outputs.
  public static getNodeInputOutputArtifacts(
    workflow?: Workflow,
    nodeId?: string,
  ): Record<'inputArtifacts' | 'outputArtifacts', Array<KeyValue<S3Artifact>>> {
    type ParamList = Array<KeyValue<S3Artifact>>;
    let inputArtifacts: ParamList = [];
    let outputArtifacts: ParamList = [];
    if (
      !nodeId ||
      !workflow ||
      !workflow.status ||
      !workflow.status.nodes ||
      !workflow.status.nodes[nodeId]
    ) {
      return { inputArtifacts, outputArtifacts };
    }

    const { inputs, outputs } = workflow.status.nodes[nodeId];
    if (!!inputs && !!inputs.artifacts) {
      inputArtifacts = inputs.artifacts.map(({ name, s3 }) => [name, s3]);
    }
    if (!!outputs && !!outputs.artifacts) {
      outputArtifacts = outputs.artifacts.map(({ name, s3 }) => [name, s3]);
    }
    return { inputArtifacts, outputArtifacts };
  }

  // Makes sure the workflow object contains the node and returns its
  // volume mounts if any.
  public static getNodeVolumeMounts(workflow: Workflow, nodeId: string): Array<KeyValue<string>> {
    if (
      !workflow ||
      !workflow.status ||
      !workflow.status.nodes ||
      !workflow.status.nodes[nodeId] ||
      !workflow.spec ||
      !workflow.spec.templates
    ) {
      return [];
    }

    const node = workflow.status.nodes[nodeId];
    const tmpl = workflow.spec.templates.find(t => !!t && !!t.name && t.name === node.templateName);
    let volumeMounts: Array<KeyValue<string>> = [];
    if (tmpl && tmpl.container && tmpl.container.volumeMounts) {
      volumeMounts = tmpl.container.volumeMounts.map(v => [v.mountPath, v.name]);
    }
    return volumeMounts;
  }

  // Makes sure the workflow object contains the node and returns its
  // action and manifest.
  public static getNodeManifest(workflow: Workflow, nodeId: string): Array<KeyValue<string>> {
    if (
      !workflow ||
      !workflow.status ||
      !workflow.status.nodes ||
      !workflow.status.nodes[nodeId] ||
      !workflow.spec ||
      !workflow.spec.templates
    ) {
      return [];
    }

    const node = workflow.status.nodes[nodeId];
    const tmpl = workflow.spec.templates.find(t => !!t && !!t.name && t.name === node.templateName);
    let manifest: Array<KeyValue<string>> = [];
    if (tmpl && tmpl.resource && tmpl.resource.action && tmpl.resource.manifest) {
      manifest = [[tmpl.resource.action, tmpl.resource.manifest]];
    }
    return manifest;
  }

  // Returns a list of output paths for the given workflow Node, by looking for
  // and the Argo artifacts syntax in the outputs section.
  public static loadNodeOutputPaths(selectedWorkflowNode: NodeStatus): StoragePath[] {
    const outputPaths: StoragePath[] = [];
    if (selectedWorkflowNode && selectedWorkflowNode.outputs) {
      (selectedWorkflowNode.outputs.artifacts || [])
        .filter(a => a.name === 'mlpipeline-ui-metadata' && !!a.s3)
        .forEach(a =>
          outputPaths.push({
            bucket: a.s3!.bucket,
            key: a.s3!.key,
            source: isS3Endpoint(a.s3!.endpoint) ? StorageService.S3 : StorageService.MINIO,
          }),
        );
    }
    return outputPaths;
  }

  // Returns a list of output paths for the entire workflow, by searching all nodes in
  // the workflow, and parsing outputs for each.
  public static loadAllOutputPaths(workflow: Workflow): StoragePath[] {
    return this.loadAllOutputPathsWithStepNames(workflow).map(entry => entry.path);
  }

  // Returns a list of object mapping a step name to output path for the entire workflow,
  // by searching all nodes in the workflow, and parsing outputs for each.
  public static loadAllOutputPathsWithStepNames(
    workflow: Workflow,
  ): Array<{ stepName: string; path: StoragePath }> {
    const outputPaths: Array<{ stepName: string; path: StoragePath }> = [];
    if (workflow && workflow.status && workflow.status.nodes) {
      Object.keys(workflow.status.nodes).forEach(n =>
        this.loadNodeOutputPaths(workflow.status.nodes[n]).map(path =>
          outputPaths.push({ stepName: workflow.status.nodes[n].displayName, path }),
        ),
      );
    }

    return outputPaths;
  }

  // Given a storage path, returns a structured object that contains the storage
  // service (currently only GCS), and bucket and key in that service.
  public static parseStoragePath(strPath: string): StoragePath {
    if (strPath.startsWith('gs://')) {
      const pathParts = strPath.substr('gs://'.length).split('/');
      return {
        bucket: pathParts[0],
        key: pathParts.slice(1).join('/'),
        source: StorageService.GCS,
      };
    } else if (strPath.startsWith('minio://')) {
      const pathParts = strPath.substr('minio://'.length).split('/');
      return {
        bucket: pathParts[0],
        key: pathParts.slice(1).join('/'),
        source: StorageService.MINIO,
      };
    } else if (strPath.startsWith('s3://')) {
      const pathParts = strPath.substr('s3://'.length).split('/');
      return {
        bucket: pathParts[0],
        key: pathParts.slice(1).join('/'),
        source: StorageService.S3,
      };
    } else if (strPath.startsWith('http://')) {
      const pathParts = strPath.substr('http://'.length).split('/');
      return {
        bucket: pathParts[0],
        key: pathParts.slice(1).join('/'),
        source: StorageService.HTTP,
      };
    } else if (strPath.startsWith('https://')) {
      const pathParts = strPath.substr('https://'.length).split('/');
      return {
        bucket: pathParts[0],
        key: pathParts.slice(1).join('/'),
        source: StorageService.HTTPS,
      };
    } else {
      throw new Error('Unsupported storage path: ' + strPath);
    }
  }

  // Outbound nodes are roughly those nodes which are the final step of the
  // workflow's execution. More information can be found in the NodeStatus
  // interface definition.
  public static getOutboundNodes(graph: Workflow, nodeId: string): string[] {
    let outbound: string[] = [];

    if (!graph || !graph.status || !graph.status.nodes) {
      return outbound;
    }

    const node = graph.status.nodes[nodeId];
    if (!node) {
      return outbound;
    }

    if (node.type === 'Pod') {
      return [node.id];
    }
    for (const outboundNodeID of node.outboundNodes || []) {
      const outNode = graph.status.nodes[outboundNodeID];
      if (outNode && outNode.type === 'Pod') {
        outbound.push(outboundNodeID);
      } else {
        outbound = outbound.concat(this.getOutboundNodes(graph, outboundNodeID));
      }
    }
    return outbound;
  }

  // Returns whether or not the given node is one of the intermediate nodes used
  // by Argo to orchestrate the workflow. Such nodes are not generally
  // meaningful from a user's perspective.
  public static isVirtual(node: NodeStatus): boolean {
    return (
      (node.type === 'StepGroup' || node.type === 'DAG' || node.type === 'TaskGroup') &&
      !!node.boundaryID
    );
  }

  // Returns a workflow-level error string if found, empty string if none
  public static getWorkflowError(workflow: Workflow): string {
    if (
      workflow &&
      workflow.status &&
      workflow.status.message &&
      (workflow.status.phase === NodePhase.ERROR || workflow.status.phase === NodePhase.FAILED)
    ) {
      return workflow.status.message;
    } else {
      return '';
    }
  }
}
