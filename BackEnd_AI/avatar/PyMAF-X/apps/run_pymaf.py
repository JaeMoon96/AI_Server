# -*- coding: utf-8 -*-
# Headless demo for PyMAF-X: image-folder → output.pkl
# - No rendering, no video, safe checkpoint loading, input resize option.
# - Drop-in replacement for demo when you only need pkl outputs.

import os
import copy
import cv2
import time
import json
import torch
import joblib
import argparse
import numpy as np
from tqdm import tqdm
from torch.utils.data import DataLoader
import os.path as osp

from core.cfgs import cfg, parse_args
from models import pymaf_net
from core import path_config
from datasets.inference import Inference
from utils.demo_utils import convert_crop_cam_to_orig_img
from utils.geometry import convert_to_full_img_cam

from openpifpaf import decoder as ppdecoder
from openpifpaf import network as ppnetwork
from openpifpaf.predictor import Predictor
from openpifpaf.stream import Stream  # not used but imported by Predictor.configure

MIN_NUM_FRAMES = 1


def run_demo(args):
    device = torch.device('cuda') if torch.cuda.is_available() else torch.device('cpu')

    # ---- Input: image_folder only ----
    if args.image_folder is None:
        raise ValueError("--image_folder 만 지원합니다.")

    image_folder = args.image_folder
    image_names = sorted(
        x for x in os.listdir(image_folder)
        if x.lower().endswith(('.png', '.jpg', '.jpeg'))
    )
    if not image_names:
        raise FileNotFoundError(f"No images found in {image_folder}")

    num_frames = len(image_names)
    img0 = cv2.imread(osp.join(image_folder, image_names[0]))
    if img0 is None:
        raise RuntimeError(f"Failed to read first image: {image_names[0]}")
    img_shape = img0.shape

    output_path = args.output_folder
    os.makedirs(output_path, exist_ok=True)

    print(f'Input images: {num_frames}  |  First image shape: {img_shape}')

    total_time = time.time()
    args.device = device
    args.pin_memory = True if torch.cuda.is_available() else False

    # ---- OpenPifPaf person detection (images only) ----
    pp_det_file_path = osp.join(output_path, 'pp_det_results.pkl')
    pp_args = copy.deepcopy(args)
    pp_args.force_complete_pose = True
    ppdecoder.configure(pp_args)
    ppnetwork.Factory.configure(pp_args)
    ppnetwork.Factory.checkpoint = pp_args.detector_checkpoint
    Predictor.configure(pp_args)
    Stream.configure(pp_args)

    Predictor.batch_size = pp_args.detector_batch_size
    Predictor.long_edge = int(pp_args.input_long_edge)  # key: resize big inputs safely
    Predictor.loader_workers = 1

    predictor = Predictor()
    image_file_names = [osp.join(image_folder, n) for n in image_names]
    capture = predictor.images(image_file_names)

    tracking_results = {}
    print('Running openpifpaf for person detection...')
    # Avoid division by zero in tqdm total
    total_batches = max(1, num_frames // max(1, args.detector_batch_size))
    for preds, _, meta in tqdm(capture, total=total_batches):
        if args.single_person and preds:
            preds = [preds[0]]
        for pid, ann in enumerate(preds or []):
            if ann.score > args.detection_threshold:
                frame_i = meta.get('frame_i', None)
                if frame_i is None:
                    frame_i = meta.get('dataset_index', 0)
                else:
                    frame_i = frame_i - 1  # align with original code

                file_name = meta.get('file_name', image_folder)
                person_id = file_name.split('/')[-1].split('.')[0] + f'_f{frame_i}_p{pid}'

                det_wb_kps = ann.data
                det_face_kps = det_wb_kps[23:91]
                tracking_results[person_id] = {
                    'frames': [frame_i],
                    'joints2d': [det_wb_kps[:17]],
                    'joints2d_lhand': [det_wb_kps[91:112]],
                    'joints2d_rhand': [det_wb_kps[112:133]],
                    'joints2d_face': [np.concatenate([det_face_kps[17:], det_face_kps[:17]])],
                    'vis_face': [np.mean(det_face_kps[17:, -1])],
                    'vis_lhand': [np.mean(det_wb_kps[91:112, -1])],
                    'vis_rhand': [np.mean(det_wb_kps[112:133, -1])],
                }

    joblib.dump(tracking_results, pp_det_file_path)

    bbox_scale = 1.0

    # ---- Define & load model ----
    model = pymaf_net(path_config.SMPL_MEAN_PARAMS, is_train=False).to(device)

    checkpoint_paths = {'body': args.pretrained_body, 'hand': args.pretrained_hand, 'face': args.pretrained_face}
    if args.pretrained_model is not None:
        print(f'Loading pretrained weights from "{args.pretrained_model}"')
        checkpoint = torch.load(args.pretrained_model, map_location=device)

        # remove the state_dict override by hand/face sub-models
        for part in ['hand', 'face']:
            if checkpoint_paths[part] is not None:
                key_start_list = model.part_module_names[part].keys()
                for key in list(checkpoint['model'].keys()):
                    for key_start in key_start_list:
                        if key.startswith(key_start):
                            checkpoint['model'].pop(key)

        # safe load
        missing, unexpected = model.load_state_dict(checkpoint['model'], strict=False)
        if missing or unexpected:
            print("[warn] state_dict mismatch:",
                  "\n  missing:", missing,
                  "\n  unexpected:", unexpected)
        print(f'Loaded checkpoint: {args.pretrained_model}')

    if not all([args.pretrained_body is None, args.pretrained_hand is None, args.pretrained_face is None]):
        for part in ['body', 'hand', 'face']:
            checkpoint_path = checkpoint_paths[part]
            if checkpoint_path is not None:
                print(f'Loading checkpoint for the {part} part.')
                ckpt = torch.load(checkpoint_path, map_location=device)['model']
                checkpoint_filtered = {}
                key_start_list = model.part_module_names[part].keys()
                for key in list(ckpt.keys()):
                    for key_start in key_start_list:
                        if key.startswith(key_start):
                            checkpoint_filtered[key] = ckpt[key]
                model.load_state_dict(checkpoint_filtered, strict=False)
                print(f'Loaded checkpoint for the {part} part.')

    model.eval()

    # ---- Run prediction on each person ----
    if args.recon_result_file:
        pred_results = joblib.load(args.recon_result_file)
        print('Loaded results from ' + args.recon_result_file)
    else:
        # Build dataset from detections
        if args.tracking_method != 'pose':
            raise NotImplementedError("Only pose-based tracking is supported in headless demo.")

        bboxes = []
        joints2d = []
        frames = []
        wb_kps = {
            'joints2d_lhand': [],
            'joints2d_rhand': [],
            'joints2d_face': [],
            'vis_face': [],
            'vis_lhand': [],
            'vis_rhand': [],
        }

        person_id_list = list(tracking_results.keys())
        for person_id in person_id_list:
            joints2d.extend(tracking_results[person_id]['joints2d'])
            wb_kps['joints2d_lhand'].extend(tracking_results[person_id]['joints2d_lhand'])
            wb_kps['joints2d_rhand'].extend(tracking_results[person_id]['joints2d_rhand'])
            wb_kps['joints2d_face'].extend(tracking_results[person_id]['joints2d_face'])
            wb_kps['vis_lhand'].extend(tracking_results[person_id]['vis_lhand'])
            wb_kps['vis_rhand'].extend(tracking_results[person_id]['vis_rhand'])
            wb_kps['vis_face'].extend(tracking_results[person_id]['vis_face'])
            frames.extend(tracking_results[person_id]['frames'])

        dataset = Inference(
            image_folder=image_folder,
            frames=frames,
            bboxes=bboxes,
            joints2d=joints2d,
            scale=bbox_scale,
            full_body=True,
            person_ids=person_id_list,
            wb_kps=wb_kps,
        )

        bboxes = dataset.bboxes
        scales = dataset.scales
        frames = dataset.frames

        dataloader = DataLoader(dataset, batch_size=args.model_batch_size, num_workers=2)

        with torch.no_grad():
            pred_cam, pred_verts, pred_smplx_verts = [], [], []
            pred_pose, pred_betas, pred_joints3d = [], [], []
            orig_height, orig_width = [], []
            person_ids = []
            smplx_params = []

            for batch in tqdm(dataloader):
                # Move tensors to device
                batch = {k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in batch.items()}

                person_ids.extend(batch['person_id'])
                orig_height.append(batch['orig_height'])
                orig_width.append(batch['orig_width'])

                preds_dict, _ = model(batch)
                output = preds_dict['mesh_out'][-1]

                pred_cam.append(output['theta'][:, :3])
                pred_verts.append(output['verts'])
                pred_smplx_verts.append(output['smplx_verts'])
                pred_pose.append(output['theta'][:, 13:85])
                pred_betas.append(output['theta'][:, 3:13])
                pred_joints3d.append(output['kp_3d'])

                smplx_params.append({
                    'shape': output['pred_shape'],
                    'body_pose': output['rotmat'],
                    'left_hand_pose': output['pred_lhand_rotmat'],
                    'right_hand_pose': output['pred_rhand_rotmat'],
                    'jaw_pose': output['pred_face_rotmat'][:, 0:1],
                    'leye_pose': output['pred_face_rotmat'][:, 1:2],
                    'reye_pose': output['pred_face_rotmat'][:, 2:3],
                    'expression': output['pred_exp'],
                })

            # concat
            pred_cam = torch.cat(pred_cam, dim=0)
            pred_verts = torch.cat(pred_verts, dim=0)
            pred_smplx_verts = torch.cat(pred_smplx_verts, dim=0)
            pred_pose = torch.cat(pred_pose, dim=0)
            pred_betas = torch.cat(pred_betas, dim=0)
            pred_joints3d = torch.cat(pred_joints3d, dim=0)
            orig_height = torch.cat(orig_height, dim=0)
            orig_width = torch.cat(orig_width, dim=0)

        # Save results
        pred_cam = pred_cam.cpu().numpy()
        pred_verts = pred_verts.cpu().numpy()
        pred_smplx_verts = pred_smplx_verts.cpu().numpy()
        pred_pose = pred_pose.cpu().numpy()
        pred_betas = pred_betas.cpu().numpy()
        pred_joints3d = pred_joints3d.cpu().numpy()
        orig_height = orig_height.cpu().numpy()
        orig_width = orig_width.cpu().numpy()

        orig_cam = convert_crop_cam_to_orig_img(
            cam=pred_cam,
            bbox=bboxes,
            img_width=orig_width,
            img_height=orig_height
        )

        camera_translation = convert_to_full_img_cam(
            pare_cam=pred_cam,
            bbox_height=scales * 200.,
            bbox_center=bboxes[:, :2],
            img_w=orig_width,
            img_h=orig_height,
            focal_length=5000.,
        )

        pred_results = {
            'pred_cam': pred_cam,
            'orig_cam': orig_cam,
            'orig_cam_t': camera_translation,
            'verts': pred_verts,
            'smplx_verts': pred_smplx_verts,
            'pose': pred_pose,
            'betas': pred_betas,
            'joints3d': pred_joints3d,
            'joints2d': joints2d,
            'bboxes': bboxes,
            'frame_ids': frames,
            'person_ids': person_ids,
            'smplx_params': smplx_params,
        }

        # meta (optional but useful)
        meta = {
            "torch": torch.__version__,
            "cuda": torch.version.cuda if torch.cuda.is_available() else None,
            "device": str(device),
            "args": {k: (str(v) if not isinstance(v, (int, float, str, bool)) else v) for k, v in vars(args).items()},
            "time": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        with open(osp.join(output_path, "meta.json"), "w") as f:
            json.dump(meta, f, indent=2)

        print(f'Saving output results to "{osp.join(output_path, "output.pkl")}"')
        joblib.dump(pred_results, osp.join(output_path, "output.pkl"))

    total_time = time.time() - total_time
    print(f'Total time spent for reconstruction: {total_time:.2f} seconds (including model loading time).')
    print('================= PyMAF-X END =================')


class CustomFormatter(argparse.ArgumentDefaultsHelpFormatter,
                      argparse.RawDescriptionHelpFormatter):
    pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser(formatter_class=CustomFormatter)

    print('initializing openpifpaf')
    ppnetwork.Factory.cli(parser)
    ppdecoder.cli(parser)
    Predictor.cli(parser)
    Stream.cli(parser)

    parser.add_argument('--image_folder', type=str, default=None,
                        help='input image folder (required)')
    parser.add_argument('--output_folder', type=str, default='output',
                        help='output folder to write results')
    parser.add_argument('--tracking_method', type=str, default='pose', choices=['bbox', 'pose'],
                        help='tracking method (pose only in this headless demo)')
    parser.add_argument('--detector_checkpoint', type=str, default='shufflenetv2k30-wholebody',
                        help='detector checkpoint for openpifpaf')
    parser.add_argument('--detector_batch_size', type=int, default=1,
                        help='batch size for person detection')
    parser.add_argument('--detection_threshold', type=float, default=0.55,
                        help='pifpaf detection score threshold.')
    parser.add_argument('--single_person', action='store_true',
                        help='only one person in the scene.')
    parser.add_argument('--cfg_file', type=str, default='configs/pymafx_config.yaml',
                        help='config file path.')
    parser.add_argument('--pretrained_model', default=None,
                        help='Path to network checkpoint')
    parser.add_argument('--pretrained_body', default=None,
                        help='Load a pretrained checkpoint for body at the beginning training')
    parser.add_argument('--pretrained_hand', default=None,
                        help='Load a pretrained checkpoint for hand at the beginning training')
    parser.add_argument('--pretrained_face', default=None,
                        help='Load a pretrained checkpoint for face at the beginning training')
    parser.add_argument('--misc', default=None, type=str, nargs="*",
                        help='other parameters')
    parser.add_argument('--model_batch_size', type=int, default=8,
                        help='batch size for SMPL prediction')

    # headless-specific
    parser.add_argument('--input_long_edge', type=int, default=1024,
                        help='Resize input for detector to this long-edge (e.g., 1024).')
    parser.add_argument('--recon_result_file', type=str, default='',
                        help='path to reconstruction result file (optional)')

    args = parser.parse_args()
    parse_args(args)

    print('Running demo...')
    run_demo(args)
